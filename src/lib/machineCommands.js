// Server-only: remote support commands sent to a machine's Pi.
// Commands use the same signed format as the guest pickup links
// (see supabase/functions/send-pickup-email): "<CMD>|ts=..|start=..|exp=..",
// HMAC-SHA256 (base64) with SIGNING_SECRET, sent to <machine_cloud_url>/action.
import crypto from "crypto";
import { extractStatusText, isRelayOnSuccess, parseLimitSwitch } from "@/lib/pickup";

/** Remote actions support can run. `log` = the machine_events kind written after it. */
export const ACTIONS = {
  open_door: { log: "door_unlocked", needsSlot: false },
  door_status: { log: null, needsSlot: false }, // used after open_door to read the sensor
  unlock_slot: { log: "slot_unlocked", needsSlot: true },
  slot_status: { log: null, needsSlot: true },
  sync: { log: "whitelist_sync", needsSlot: false },
};

/**
 * How long a remote command stays valid on the Pi. The Pi rejected a 5-minute
 * window as "Command expired" (it compares against its own local clock), so use
 * the same 24-hour window as PI:REFRESH_WHITELIST. The signed URL is built and
 * sent by the server in one go and never shown to anyone.
 */
const VALID_BEFORE_MS = 24 * 60 * 60 * 1000;
const VALID_AFTER_MS = 24 * 60 * 60 * 1000;
// Netlify stops a server function after ~10 s; keep every action well under that.
const T = { relay: 4500, status: 2500 };

/** "yyyy-MM-ddTHH:mm:ss" in UTC (what the Pi expects for start/exp). */
export function utcT(d) {
  return d.toISOString().slice(0, 19);
}

/** Offset of an IANA time zone from UTC at `date`, in seconds (0 when unknown). */
export function tzOffsetSeconds(tz, date = new Date()) {
  if (!tz || tz === "UTC") return 0;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 1000);
  } catch {
    return 0;
  }
}

/** The command text for an action (throws on a bad action or slot). */
export function buildCommand(action, { machineCode, slot, now = new Date(), tz = "UTC" }) {
  const def = ACTIONS[action];
  if (!def) throw new Error("Unknown action");
  const n = parseInt(slot, 10);
  if (def.needsSlot && !(n >= 1 && n <= 99)) throw new Error("Pick a slot");

  const start = utcT(new Date(now.getTime() - VALID_BEFORE_MS));
  const exp = utcT(new Date(now.getTime() + VALID_AFTER_MS));
  const ts = Math.floor(now.getTime() / 1000) + tzOffsetSeconds(tz, now);
  const tail = `|ts=${ts}|start=${start}|exp=${exp}`;

  switch (action) {
    case "open_door":
      return `PI:RELAY:ON${tail}`;
    case "door_status":
      return `PI:LIMIT:?${tail}`;
    case "unlock_slot":
      return `ESP:RELAY${n}:ON${tail}`;
    case "slot_status":
      return `ESP:LIMIT${n}:?${tail}`;
    case "sync":
      // Same format as /api/machines/[id]/refresh-keys.
      return `PI:REFRESH_WHITELIST|machine=${machineCode}|start=${start}|exp=${utcT(new Date(now.getTime() + 86400000))}`;
    default:
      throw new Error("Unknown action");
  }
}

export function signCommand(cmd, secret) {
  if (!secret) throw new Error("SIGNING_SECRET is missing on the server");
  return crypto.createHmac("sha256", secret).update(cmd, "utf8").digest("base64");
}

export function commandUrl(base, cmd, secret) {
  const root = String(base || "").replace(/\/+$/, "");
  return `${root}/action?cmd=${encodeURIComponent(cmd)}&sig=${encodeURIComponent(signCommand(cmd, secret))}`;
}

/** Machine address: MACHINE_<ID>_URL env override, else machines.machine_cloud_url. */
export function machineBaseUrl(machine, env = process.env) {
  const code = String(machine?.machine_id || "")
    .trim()
    .toUpperCase();
  const fromEnv = /^[A-Z0-9_]+$/.test(code) ? String(env[`MACHINE_${code}_URL`] || "").trim() : "";
  return (fromEnv || String(machine?.machine_cloud_url || "").trim()).replace(/\/+$/, "");
}

async function callPi(url, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "KeyMatic-Support/1.0", Accept: "application/json, text/plain, */*" },
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { text };
    }
    if (!r.ok) {
      const err = new Error(`Machine replied HTTP ${r.status}: ${extractStatusText(body).slice(0, 160)}`);
      // @ts-ignore
      err.code = "HTTP";
      throw err;
    }
    return body;
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error("The machine did not answer in time");
      // @ts-ignore
      err.code = "TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Read an ESP limit reply ("LIMIT3:ON" = key in the slot). */
export function parseSlotLimit(resp) {
  const text = String(resp?.esp_response || extractStatusText(resp)).toUpperCase();
  if (text.includes("LIMIT") && text.includes(":ON")) return "ON";
  if (text.includes("LIMIT") && text.includes(":OFF")) return "OFF";
  return "UNKNOWN";
}

const short = (r) => extractStatusText(r).replace(/\s+/g, " ").slice(0, 160);

/**
 * Send one action to the machine and explain the reply.
 * Returns { ok, result, message, reply }.
 */
export async function sendMachineAction({ machine, action, slot, secret, now = new Date(), fetchImpl = fetch }) {
  const base = machineBaseUrl(machine);
  if (!base) {
    return { ok: false, result: "no_address", message: "This machine has no Pi address. Add it on the Machines page." };
  }
  const opts = { machineCode: String(machine.machine_id).trim(), slot, now, tz: machine.timezone || "UTC" };
  const url = (a) => commandUrl(base, buildCommand(a, opts), secret);

  try {
    if (action === "open_door") {
      const reply = await callPi(url("open_door"), T.relay, fetchImpl);
      if (!isRelayOnSuccess(reply)) {
        return { ok: false, result: "unexpected", message: `Unexpected reply: ${short(reply)}`, reply: short(reply) };
      }
      await new Promise((r) => setTimeout(r, 300));
      let door = "UNKNOWN";
      try {
        door = parseLimitSwitch(await callPi(url("door_status"), T.status, fetchImpl));
      } catch {
        /* the door was unlocked; only the check failed */
      }
      if (door === "OFF") return { ok: true, result: "open", message: "Door unlocked and open." };
      if (door === "ON") {
        return {
          ok: true,
          result: "unlocked_closed",
          message: "Door unlocked, but it still reads closed. Ask the person to pull the door.",
        };
      }
      return { ok: true, result: "unlocked", message: "Door unlocked (could not read the door sensor)." };
    }

    if (action === "door_status") {
      const reply = await callPi(url("door_status"), T.status, fetchImpl);
      const door = parseLimitSwitch(reply);
      if (door === "OFF") return { ok: true, result: "open", message: "Door is open." };
      if (door === "ON") return { ok: true, result: "closed", message: "Door is closed." };
      return {
        ok: false,
        result: "unknown",
        message: `Door reply not understood: ${short(reply)}`,
        reply: short(reply),
      };
    }

    if (action === "unlock_slot") {
      const reply = await callPi(url("unlock_slot"), T.relay, fetchImpl);
      const text = short(reply);
      if (/no response|error|fail|invalid|denied/i.test(text)) {
        return { ok: false, result: "unexpected", message: `Slot ${slot}: ${text}`, reply: text };
      }
      return { ok: true, result: "released", message: `Slot ${slot} unlocked. The key can be taken now.`, reply: text };
    }

    if (action === "slot_status") {
      const reply = await callPi(url("slot_status"), T.status, fetchImpl);
      const s = parseSlotLimit(reply);
      if (s === "ON") return { ok: true, result: "key_in", message: `Slot ${slot}: a key is inside.` };
      if (s === "OFF") return { ok: true, result: "empty", message: `Slot ${slot}: empty.` };
      return { ok: false, result: "unknown", message: `Slot ${slot} reply not understood: ${short(reply)}` };
    }

    if (action === "sync") {
      const reply = await callPi(url("sync"), T.relay, fetchImpl);
      return { ok: true, result: "synced", message: "Key list sent to the machine.", reply: short(reply) };
    }

    return { ok: false, result: "bad_action", message: "Unknown action" };
  } catch (e) {
    // @ts-ignore
    const offline = e?.code === "TIMEOUT" || e?.code === "HTTP" || /fetch failed|ECONN|ENOTFOUND/i.test(e?.message);
    return {
      ok: false,
      result: offline ? "offline" : "error",
      message: offline ? `Cannot reach the machine: ${e.message}` : `Command failed: ${e?.message || e}`,
    };
  }
}

/** Text saved in machine_events.detail: who, why, and what happened. */
export function auditDetail({ actor, reason, outcome }) {
  return [`remote by ${actor || "admin"}`, reason ? `reason: ${String(reason).slice(0, 200)}` : "", outcome?.message]
    .filter(Boolean)
    .join(" · ");
}

const up = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

/**
 * After Sync keys the Pi knows the new keys, but it does not rewrite the
 * key_slot_presence rows of keys already sitting in a slot: they keep the UID in
 * NON_REG_UID ("unregistered"). Return the rows of this machine whose NON_REG_UID
 * is now a registered key, so they can be moved to UID.
 */
export function slotsToPromote({ machineCode, slots = [], keys = [] }) {
  const known = new Set(keys.map((k) => up(k.UID)).filter(Boolean));
  return slots.filter(
    (s) => up(s.machine_id) === up(machineCode) && !s.UID && s.NON_REG_UID && known.has(up(s.NON_REG_UID))
  );
}

/** Move synced keys from NON_REG_UID to UID. Returns how many slots were fixed. */
export async function promoteSyncedSlots(sb, machineCode) {
  const [{ data: slots, error: e1 }, { data: keys, error: e2 }] = await Promise.all([
    sb.from("key_slot_presence").select("machine_id, slot_number, UID, NON_REG_UID").not("NON_REG_UID", "is", null),
    sb.from("keys").select("UID").not("UID", "is", null),
  ]);
  if (e1 || e2) throw new Error((e1 || e2).message);
  let fixed = 0;
  for (const s of slotsToPromote({ machineCode, slots, keys })) {
    const { error } = await sb
      .from("key_slot_presence")
      .update({ UID: up(s.NON_REG_UID), NON_REG_UID: null })
      .eq("machine_id", s.machine_id)
      .eq("slot_number", s.slot_number)
      .is("UID", null);
    if (error) throw new Error(error.message);
    fixed += 1;
  }
  return fixed;
}
