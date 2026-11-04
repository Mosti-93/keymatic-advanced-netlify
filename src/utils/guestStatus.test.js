import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { guestStatus, GUEST_FILTERS } from "./guestStatus";

describe("guestStatus", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it.each([
    [{ check_in: "2026-11-03 15:00", check_out: "2026-11-06 11:00" }, "current"],
    [{ check_in: "2026-11-04 15:00", check_out: "2026-11-04 18:00" }, "current"],
    [{ check_in: "2026-11-10 15:00", check_out: "2026-11-12 11:00" }, "upcoming"],
    [{ check_in: "2026-10-01 15:00", check_out: "2026-10-03 11:00" }, "past"],
    [{}, "unknown"],
  ])("%o → %s", (booking, expected) => {
    expect(guestStatus(booking)).toBe(expected);
  });

  it("filters match their status", () => {
    const rows = [
      { check_in: "2026-11-03", check_out: "2026-11-06" },
      { check_in: "2026-12-01", check_out: "2026-12-02" },
    ];
    const count = (key) => rows.filter(GUEST_FILTERS.find((f) => f.key === key).test).length;
    expect([count("current"), count("upcoming"), count("past"), count("all")]).toEqual([1, 1, 0, 2]);
  });
});
