import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadPickup,
  loadKeyUid,
  isLinkClosed,
  completePickup,
  linkState,
  publicView,
  verifyPickup,
  runPickupAction,
} from "./pickupServer";

/**
 * Tiny in-memory stand-in for the Supabase query builder:
 * supports select/eq/maybeSingle/update and records every write.
 */
function fakeDb(tables) {
  const writes = [];
  const from = (table) => {
    const filters = [];
    let patch = null;
    const rows = () => (tables[table] || []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const builder = {
      select: () => builder,
      update: (v) => ((patch = v), builder),
      insert: async (v) => {
        (tables[table] ||= []).push(...v);
        writes.push({ table, insert: v });
        return { error: null };
      },
      eq: (k, v) => (filters.push([k, v]), builder),
      is: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve) => {
        const hit = rows();
        if (patch) {
          hit.forEach((r) => Object.assign(r, patch));
          writes.push({ table, patch, count: hit.length });
        }
        resolve({ data: hit, error: null });
      },
    };
    return builder;
  };
  return { from, writes };
}

const booking = () => ({
  pickup_requests: [{ link_token: "tok", valid: true, room_no: "204", machine_id: "a12", check_out: "2099-01-01" }],
  keys: [{ room_number: "204", UID: "AB12" }],
  key_slot_presence: [{ machine_id: "A12", UID: "AB12" }],
});

describe("pickup server helpers", () => {
  it("loads a booking by token, and nothing for unknown tokens", async () => {
    const db = fakeDb(booking());
    expect((await loadPickup(db, "tok")).room_no).toBe("204");
    expect(await loadPickup(db, "nope")).toBeNull();
    expect(await loadPickup(db, "")).toBeNull();
  });

  it("finds the key UID for a room", async () => {
    const db = fakeDb(booking());
    expect(await loadKeyUid(db, "204")).toBe("AB12");
    expect(await loadKeyUid(db, "999")).toBeNull();
  });

  it("knows when a link is closed", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(isLinkClosed({ valid: true, check_out: "2026-11-05" }, now)).toBe(false);
    expect(isLinkClosed({ valid: false }, now)).toBe(true);
    expect(isLinkClosed({ valid: true, check_out: "2026-11-01" }, now)).toBe(true);
    expect(isLinkClosed(null, now)).toBe(true);
  });
});

describe("completePickup", () => {
  it("expires the link, marks the key out and clears its slot using DB values", async () => {
    const tables = booking();
    const db = fakeDb(tables);
    const out = await completePickup(db, "tok");

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, linkUpdated: true, keyUpdated: true, slotsCleared: 1 });
    expect(tables.pickup_requests[0].valid).toBe(false);
    expect(tables.keys[0].isPresent).toBe("OUT");
    expect(tables.key_slot_presence[0].UID).toBeNull();
  });

  it("refuses unknown and already-used links", async () => {
    expect((await completePickup(fakeDb(booking()), "nope")).status).toBe(404);

    const used = booking();
    used.pickup_requests[0].valid = false;
    const db = fakeDb(used);
    expect((await completePickup(db, "tok")).status).toBe(409);
    expect(db.writes).toHaveLength(0);
  });
});

const NOW = new Date("2026-11-05T12:00:00Z");

const fullBooking = (extra = {}) => ({
  pickup_requests: [
    {
      link_token: "tok",
      valid: true,
      room_no: "204",
      machine_id: "a08",
      client_first_name: "Sara",
      client_last_name: "Smith",
      check_in: "2026-11-05 10:00:00",
      check_out: "2026-11-06 10:00:00",
      UID: "AB12",
      slot_number: 3,
      wrong_tries: 0,
      door_on_req: "https://pi/door",
      door_status_req: "https://pi/door-status",
      relay_on_req: "https://pi/relay",
      relay_status_req: "https://pi/relay-status",
      LCD_room_req: "https://pi/lcd-room",
      LCD_flash_req: "https://pi/lcd-flash",
      LCD_off_req: "https://pi/lcd-off",
      ...extra,
    },
  ],
  keys: [{ room_number: "204", UID: "AB12" }],
  key_slot_presence: [{ machine_id: "A08", UID: "AB12" }],
  machine_events: [],
});

describe("link window", () => {
  it("only opens between check-in and check-out", () => {
    const row = fullBooking().pickup_requests[0];
    expect(linkState(row, new Date("2026-11-05T09:59:00Z"))).toBe("notyet");
    expect(linkState(row, NOW)).toBe("ok");
    expect(linkState(row, new Date("2026-11-06T10:01:00Z"))).toBe("expired");
    expect(linkState({ ...row, valid: false }, NOW)).toBe("used");
  });

  it("never gives the phone the answers or the machine links", () => {
    const view = publicView(fullBooking().pickup_requests[0], NOW);
    const text = JSON.stringify(view);
    expect(view.state).toBe("ok");
    expect(text).not.toContain("Smith");
    expect(text).not.toMatch(/a08/i);
    expect(text).not.toContain("https://pi");
  });
});

describe("verifyPickup", () => {
  it("accepts the right answers and marks the link verified", async () => {
    const tables = fullBooking();
    const out = await verifyPickup(fakeDb(tables), "tok", { lastName: " smith ", machineId: "A08" }, NOW);
    expect(out.status).toBe(200);
    expect(tables.pickup_requests[0].verified_at).toBe(NOW.toISOString());
  });

  it("counts wrong answers and locks after 5", async () => {
    const tables = fullBooking();
    const db = fakeDb(tables);
    for (let i = 1; i <= 4; i++) {
      const out = await verifyPickup(db, "tok", { lastName: "Smith", machineId: "A01" }, NOW);
      expect(out.status).toBe(401);
      expect(out.body.triesLeft).toBe(5 - i);
    }
    const fifth = await verifyPickup(db, "tok", { lastName: "Smith", machineId: "A01" }, NOW);
    expect(fifth.status).toBe(423);
    // Even the right answer is refused while locked.
    const locked = await verifyPickup(db, "tok", { lastName: "Smith", machineId: "A08" }, NOW);
    expect(locked.status).toBe(423);
    expect(tables.pickup_requests[0].verified_at).toBeUndefined();
  });

  it("refuses before check-in", async () => {
    const out = await verifyPickup(
      fakeDb(fullBooking()),
      "tok",
      { lastName: "Smith", machineId: "A08" },
      new Date("2026-11-05T09:00:00Z")
    );
    expect(out.status).toBe(410);
    expect(out.body.state).toBe("notyet");
  });
});

describe("runPickupAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answers = (map) => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        calls.push(String(url));
        const text = map[String(url)] ?? "ok";
        return { ok: true, status: 200, text: async () => text };
      })
    );
    return calls;
  };

  it("does nothing on the machine until the guest is verified", async () => {
    const calls = answers({});
    const out = await runPickupAction(fakeDb(fullBooking()), "tok", "open", NOW);
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("stops working when the check is older than 3 minutes", async () => {
    const calls = answers({});
    const old = new Date(NOW.getTime() - 4 * 60000).toISOString();
    const out = await runPickupAction(fakeDb(fullBooking({ verified_at: old })), "tok", "open", NOW);
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("opens the door, confirms it and logs it", async () => {
    const tables = fullBooking({ verified_at: NOW.toISOString() });
    const calls = answers({
      "https://pi/door": "Pi relay turned ON",
      "https://pi/door-status": "Limit switch is OFF",
    });
    const out = await runPickupAction(fakeDb(tables), "tok", "open", NOW);
    expect(out.body.result).toBe("open");
    expect(calls).toEqual(["https://pi/door", "https://pi/door-status", "https://pi/lcd-room"]);
    expect(tables.machine_events[0]).toMatchObject({ machine_id: "A08", kind: "door_unlocked", slot: 0 });
  });

  it("finishes the pickup when the key is out", async () => {
    const tables = fullBooking({ verified_at: NOW.toISOString() });
    answers({ "https://pi/relay-status": "LIMIT3:OFF" });
    const out = await runPickupAction(fakeDb(tables), "tok", "check", NOW);
    expect(out.body.result).toBe("taken");
    expect(tables.pickup_requests[0].valid).toBe(false);
    expect(tables.keys[0].isPresent).toBe("OUT");
  });

  it("reports an offline machine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, text: async () => "" }))
    );
    const tables = fullBooking({ verified_at: NOW.toISOString() });
    const out = await runPickupAction(fakeDb(tables), "tok", "open", NOW);
    expect(out.body.result).toBe("offline");
  });
});
