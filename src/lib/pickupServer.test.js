import { describe, it, expect } from "vitest";
import { loadPickup, loadKeyUid, isLinkClosed, completePickup } from "./pickupServer";

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
