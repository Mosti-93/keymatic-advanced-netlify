import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import {
  auditDetail,
  buildCommand,
  commandUrl,
  machineBaseUrl,
  sendMachineAction,
  tzOffsetSeconds,
} from "./machineCommands";

const now = new Date("2026-11-05T12:00:00Z");

describe("buildCommand", () => {
  it("builds the same signed command format as the pickup links", () => {
    expect(buildCommand("open_door", { machineCode: "A08", now })).toBe(
      `PI:RELAY:ON|ts=${now.getTime() / 1000}|start=2026-11-05T11:58:00|exp=2026-11-05T12:05:00`
    );
    expect(buildCommand("unlock_slot", { machineCode: "A08", slot: 3, now })).toMatch(/^ESP:RELAY3:ON\|ts=/);
    expect(buildCommand("slot_status", { machineCode: "A08", slot: "12", now })).toMatch(/^ESP:LIMIT12:\?\|/);
    expect(buildCommand("door_status", { machineCode: "A08", now })).toMatch(/^PI:LIMIT:\?\|/);
    expect(buildCommand("sync", { machineCode: "A08", now })).toMatch(/^PI:REFRESH_WHITELIST\|machine=A08\|/);
  });

  it("adds the machine's time zone offset to ts", () => {
    expect(tzOffsetSeconds("Africa/Cairo", now)).toBe(7200);
    const cmd = buildCommand("open_door", { machineCode: "A08", now, tz: "Africa/Cairo" });
    expect(cmd).toContain(`ts=${now.getTime() / 1000 + 7200}`);
  });

  it("rejects bad input", () => {
    expect(() => buildCommand("explode", { machineCode: "A08" })).toThrow();
    expect(() => buildCommand("unlock_slot", { machineCode: "A08", slot: 0 })).toThrow();
  });

  it("signs with HMAC-SHA256 base64", () => {
    const url = commandUrl("https://pi.example/", "PI:LIMIT:?", "s3cret");
    const sig = crypto.createHmac("sha256", "s3cret").update("PI:LIMIT:?").digest("base64");
    expect(url).toBe(
      `https://pi.example/action?cmd=${encodeURIComponent("PI:LIMIT:?")}&sig=${encodeURIComponent(sig)}`
    );
  });

  it("prefers the MACHINE_<ID>_URL override", () => {
    const m = { machine_id: "a08 ", machine_cloud_url: "https://db/" };
    expect(machineBaseUrl(m, {})).toBe("https://db");
    expect(machineBaseUrl(m, { MACHINE_A08_URL: "https://env/" })).toBe("https://env");
  });
});

const reply = (text, status = 200) => Promise.resolve(new Response(text, { status }));

describe("sendMachineAction", () => {
  const machine = { machine_id: "A08", machine_cloud_url: "https://pi" };

  it("opens the door and reads the door sensor", async () => {
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(reply('{"status":"Pi relay turned ON"}'))
      .mockReturnValueOnce(reply("Limit switch is OFF"));
    const res = await sendMachineAction({ machine, action: "open_door", secret: "x", now, fetchImpl });
    expect(res).toMatchObject({ ok: true, result: "open" });
    expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain("cmd=PI:RELAY:ON|");
  });

  it("reports a slot reading", async () => {
    const fetchImpl = vi.fn().mockReturnValue(reply('{"esp_response":"LIMIT4:ON"}'));
    const res = await sendMachineAction({ machine, action: "slot_status", slot: 4, secret: "x", now, fetchImpl });
    expect(res).toMatchObject({ ok: true, result: "key_in" });
  });

  it("says when the machine can't be reached or has no address", async () => {
    const fetchImpl = vi.fn().mockReturnValue(reply("bad gateway", 502));
    const res = await sendMachineAction({ machine, action: "unlock_slot", slot: 2, secret: "x", now, fetchImpl });
    expect(res).toMatchObject({ ok: false, result: "offline" });
    const none = await sendMachineAction({
      machine: { machine_id: "ZZZ" },
      action: "sync",
      secret: "x",
      now,
      fetchImpl,
    });
    expect(none.result).toBe("no_address");
  });

  it("writes who and why in the log text", () => {
    expect(auditDetail({ actor: "a@b.c", reason: "guest called", outcome: { message: "Door unlocked" } })).toBe(
      "remote by a@b.c · reason: guest called · Door unlocked"
    );
  });
});
