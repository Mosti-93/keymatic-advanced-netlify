import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkAnswers,
  extractStatusText,
  isRelayOnSuccess,
  parseLimitSwitch,
  normalizeToken,
  formatName,
  fetchWithTimeout,
  invalidateByUID,
} from "./pickup";

const booking = { machineId: "A12", clientLastName: "Hassan" };

describe("checkAnswers", () => {
  it("accepts matching answers, ignoring case and spaces", () => {
    expect(checkAnswers({ lastName: "  hassan ", machineId: ["a", "1", "2"] }, booking)).toEqual({
      ok: true,
      error: "",
    });
  });

  it("explains which answer is wrong", () => {
    expect(checkAnswers({ lastName: "Ali", machineId: ["A", "1", "2"] }, booking).error).toMatch(/last name/);
    expect(checkAnswers({ lastName: "Hassan", machineId: ["B", "1", "2"] }, booking).error).toMatch(/machine ID/);
    expect(checkAnswers({ lastName: "Ali", machineId: ["B", "0", "0"] }, booking).error).toMatch(/Both/);
  });

  it("asks for missing fields and missing data", () => {
    expect(checkAnswers({ lastName: "", machineId: ["", "", ""] }, booking).error).toBe("Please fill all fields");
    expect(checkAnswers({ lastName: "x", machineId: ["A"] }, null)).toEqual({
      ok: false,
      error: "Data not loaded yet",
    });
  });
});

describe("machine replies", () => {
  it("extracts text from strings and common shapes", () => {
    expect(extractStatusText("hi")).toBe("hi");
    expect(extractStatusText({ text: "t" })).toBe("t");
    expect(extractStatusText({ status: "s" })).toBe("s");
    expect(extractStatusText({ message: "m" })).toBe("m");
    expect(extractStatusText({ other: 1 })).toBe('{"other":1}');
    expect(extractStatusText(null)).toBe("");
  });

  it("detects a successful relay", () => {
    expect(isRelayOnSuccess({ text: "OK: Pi relay turned ON" })).toBe(true);
    expect(isRelayOnSuccess("relay error")).toBe(false);
  });

  it("parses the door limit switch", () => {
    expect(parseLimitSwitch("Limit switch is OFF")).toBe("OFF");
    expect(parseLimitSwitch({ text: "LIMIT SWITCH IS ON" })).toBe("ON");
    expect(parseLimitSwitch("???")).toBe("UNKNOWN");
  });
});

describe("small helpers", () => {
  it("normalizes route tokens", () => {
    expect(normalizeToken("abc")).toBe("abc");
    expect(normalizeToken(["x", "y"])).toBe("x");
    expect(normalizeToken(undefined)).toBe("");
  });

  it("formats names", () => {
    expect(formatName("hASSAN")).toBe("Hassan");
    expect(formatName("")).toBe("");
  });
});

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("parses JSON, falls back to text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, text: async () => '{"a":1}' }));
    await expect(fetchWithTimeout("u")).resolves.toEqual({ a: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, text: async () => "plain" }));
    await expect(fetchWithTimeout("u")).resolves.toEqual({ text: "plain" });
  });

  it("rejects on HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    await expect(fetchWithTimeout("u")).rejects.toThrow("HTTP 503");
  });

  it("rejects with code TIMEOUT when the machine does not answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
          )
      )
    );
    const p = fetchWithTimeout("u", 1000);
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeSupabase(responses) {
  const calls = [];
  const from = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const builder = {
      update: (v) => (call.ops.push(["update", v]), builder),
      eq: (k, v) => (call.ops.push(["eq", k, v]), builder),
      select: () => builder,
      then: (resolve) => resolve(responses.shift() ?? { data: [], error: null }),
    };
    return builder;
  };
  return { from, calls };
}

describe("invalidateByUID", () => {
  it("expires the link, marks the key out and clears its slot", async () => {
    const sb = fakeSupabase([{ error: null }, { error: null }, { data: [{ id: 1 }], error: null }]);
    const result = await invalidateByUID(sb, { token: "tok", uid: "AB12", machineId: "a12" });

    expect(result).toEqual({ linkUpdated: true, keyUpdated: true, slotsCleared: 1 });
    expect(sb.calls.map((c) => c.table)).toEqual(["pickup_requests", "keys", "key_slot_presence"]);
    const slot = sb.calls[2].ops;
    expect(slot).toContainEqual(["update", { UID: null }]);
    expect(slot).toContainEqual(["eq", "machine_id", "A12"]);
  });

  it("skips key and slot updates without a UID", async () => {
    const sb = fakeSupabase([{ error: null }]);
    const result = await invalidateByUID(sb, { token: "tok", uid: null });
    expect(result).toEqual({ linkUpdated: true, keyUpdated: false, slotsCleared: 0 });
    expect(sb.calls).toHaveLength(1);
  });

  it("requires a token and surfaces DB errors", async () => {
    await expect(invalidateByUID(fakeSupabase([]), { token: "" })).rejects.toThrow("Missing token");
    const err = new Error("db down");
    await expect(invalidateByUID(fakeSupabase([{ error: err }]), { token: "t", uid: "x" })).rejects.toBe(err);
  });
});
