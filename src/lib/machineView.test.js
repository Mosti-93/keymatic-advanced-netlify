import { describe, it, expect } from "vitest";
import {
  buildAlerts,
  buildKeyStatus,
  buildMachineCards,
  buildUpcoming,
  eventGroup,
  eventLabel,
  slotRows,
  sortEvents,
} from "./machineView";

const now = new Date("2026-11-05T12:00:00");
const iso = (h) => new Date(now.getTime() + h * 3600000).toISOString();

const machines = [
  {
    id: 1,
    machine_id: "A08\n",
    "Machine name": "111122",
    capacity: 9,
    last_seen_at: iso(-0.01),
    door_status: "open",
    door_updated_at: iso(-1),
    machine_cloud_url: "https://pi",
  },
  { id: 2, machine_id: "A12", "Machine name": "Alpha", capacity: 4, last_seen_at: iso(-1) },
];
const keys = [
  { id: 10, uuid: "u10", key_id: "K1", UID: "aa01", room_number: "101", machine_id: "A08" },
  { id: 11, uuid: "u11", key_id: "K2", UID: "AA02", room_number: "102", machine_id: "A08" },
  { id: 12, uuid: "u12", key_id: "K3", UID: "AA03", room_number: "103", machine_id: "A08" },
  { id: 13, uuid: "u13", key_id: "K4", UID: "AA04", room_number: "104", machine_id: "1" }, // old style: machines.id
  { id: 14, uuid: "u14", key_id: "K5", UID: "AA05", room_number: "105", machine_id: "A12" },
];
const slots = [
  { machine_id: "A08", slot_number: 1, UID: "AA01" },
  { machine_id: "A08", slot_number: 2, UID: null, NON_REG_UID: "ff99" },
  { machine_id: "A08", slot_number: 3, UID: "AA05" }, // key linked to A12 sitting in A08
];
const clients = [
  { id: 1, first_name: "Omar", last_name: "S", key_id: "u10", check_in: iso(-2), check_out: iso(20) }, // staying, key still in
  { id: 2, first_name: "Gren", key_id: "u11", check_in: iso(-30), check_out: iso(1) }, // staying, key out, returns soon
  { id: 3, first_name: "Late", key_id: "u12", check_in: iso(-50), check_out: iso(-3) }, // ended, key not back
];

describe("buildMachineCards", () => {
  const [a08, a12] = buildMachineCards({ machines, slots, keys, now });

  it("counts keys in, linked and free to link", () => {
    expect(a08.code).toBe("A08");
    expect(a08.regIn).toBe(2);
    expect(a08.unregIn).toBe(1);
    expect(a08.inCount).toBe(3);
    expect(a08.linked).toBe(4); // K1-K3 by code, K4 by old numeric id
    expect(a08.linkedIn).toBe(1);
    expect(a08.linkedOut).toBe(3);
    expect(a08.freeToLink).toBe(5);
    expect(a08.freeSlots).toBe(6);
  });

  it("describes each slot", () => {
    expect(a08.slots[0]).toMatchObject({ n: 1, uid: "AA01", room: "101", unreg: false, foreign: false });
    expect(a08.slots[1]).toMatchObject({ n: 2, uid: "FF99", unreg: true });
    expect(a08.slots[2]).toMatchObject({ n: 3, room: "105", foreign: true });
    expect(a08.slots[3]).toMatchObject({ n: 4, uid: "" });
  });

  it("reads heartbeat and door", () => {
    expect(a08.online).toBe(true);
    expect(a08.door).toBe("open");
    expect(a08.doorOpenTooLong).toBe(true);
    expect(a12.online).toBe(false);
  });
});

describe("buildKeyStatus", () => {
  const rows = buildKeyStatus({ keys, slots, clients, machines, now });
  const by = (id) => rows.find((r) => r.id === id);

  it("labels every key and puts the urgent ones first", () => {
    expect(by(10).state).toBe("waiting");
    expect(by(11).state).toBe("guest");
    expect(by(12).state).toBe("overdue");
    expect(by(13).state).toBe("out");
    expect(by(14)).toMatchObject({ state: "in", slot: 3, slotMachine: "A08", machineCode: "A12" });
    expect(rows[0].state).toBe("overdue");
  });

  it("feeds Upcoming and alerts", () => {
    const up = buildUpcoming({ keyStatus: rows, keys, clients, now });
    expect(up.map((e) => `${e.type}:${e.guest}`)).toEqual([
      "overdue:Late",
      "pickup:Omar S",
      "return:Gren",
      "return:Omar S",
    ]);
    expect(up[1]).toMatchObject({ guest: "Omar S", late: true });

    const alerts = buildAlerts({ cards: buildMachineCards({ machines, slots, keys, now }), keyStatus: rows });
    const text = alerts.map((a) => a.text).join("\n");
    expect(text).toMatch(/Alpha \(A12\): Offline/);
    expect(text).toMatch(/111122 \(A08\): Door open for/);
    expect(text).toMatch(/111122 \(A08\): 1 unregistered key inside/);
    expect(text).toMatch(/111122 \(A08\): 1 key not returned: room 103/);
    expect(alerts.every((a) => a.machine)).toBe(true);
  });
});

describe("slotRows", () => {
  it("lays slots out 5, 4, 5, 4 like the machine", () => {
    const sizes = (n) => slotRows(Array.from({ length: n }, (_, i) => i + 1)).map((r) => r.length);
    expect(sizes(9)).toEqual([5, 4]);
    expect(sizes(18)).toEqual([5, 4, 5, 4]);
    expect(sizes(20)).toEqual([5, 4, 5, 4, 2]);
  });
});

describe("machine log helpers", () => {
  it("labels and groups events", () => {
    expect(eventLabel("door_unlocked")).toBe("Door unlocked");
    expect(eventLabel("weird_thing")).toBe("Weird thing");
    expect(eventGroup("slot_unlocked")).toBe("key");
    expect(eventGroup("door_closed")).toBe("door");
    expect(eventGroup("remote_failed")).toBe("problem");
  });

  it("sorts newest first", () => {
    const list = sortEvents([
      { id: 1, created_at: iso(-2) },
      { id: 2, created_at: iso(-1) },
    ]);
    expect(list.map((e) => e.id)).toEqual([2, 1]);
  });
});
