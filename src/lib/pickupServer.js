// Server-only database access for the guest pickup flow.
// Guests are not signed in, so the browser must not read or write these tables
// directly (that is what lets Row Level Security lock them). These helpers run
// in API routes with the service role key and only ever act on the one booking
// that the secret link token points to.
import { createClient } from "@supabase/supabase-js";
import {
  TABLE_NAME,
  TOKEN_COLUMN,
  DB_COLUMNS,
  invalidateByUID,
  checkAnswers,
  extractStatusText,
  isRelayOnSuccess,
  parseLimitSwitch,
} from "@/lib/pickup";

/** Columns the server needs (the browser never sees most of these). */
export const SERVER_COLUMNS = `${DB_COLUMNS},check_in,slot_number,UID,verified_at,wrong_tries,locked_until`;

export const MAX_WRONG_TRIES = 5;
export const LOCK_MINUTES = 10;
export const VERIFIED_MINUTES = 3;

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing Supabase configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Booking row for a link token, or null when the token is unknown. */
export async function loadPickup(sb, token) {
  if (!token) return null;
  const { data, error } = await sb.from(TABLE_NAME).select(SERVER_COLUMNS).eq(TOKEN_COLUMN, token).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** UID of the key for this booking's room (same lookup the page used to do). */
export async function loadKeyUid(sb, roomNo) {
  if (!roomNo) return null;
  const { data, error } = await sb.from("keys").select("UID").eq("room_number", roomNo).maybeSingle();
  if (error) throw error;
  return data?.UID ?? null;
}

/** True when the link can no longer be used. */
export function isLinkClosed(row, now = new Date()) {
  return linkState(row, now) !== "ok";
}

/** Dates are saved in UTC; read ones without a zone as UTC too. */
function utc(v) {
  if (!v) return null;
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T00:00:00Z`);
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(str) ? str : str.replace(" ", "T") + "Z");
}

/** "ok" | "used" | "expired" | "notyet" (before check-in) | "missing". */
export function linkState(row, now = new Date()) {
  if (!row) return "missing";
  if (row.valid === false) return "used";
  if (row.check_out && now > utc(row.check_out)) return "expired";
  if (row.check_in && now < utc(row.check_in)) return "notyet";
  return "ok";
}

/** What the guest's phone may see: no answers, no machine command links. */
export function publicView(row, now = new Date()) {
  return {
    state: linkState(row, now),
    clientFirstName: row.client_first_name || "",
    city: row.city || "",
    machineAddress: row.machine_address || "",
    machineName: row.machine_name || "",
    roomNo: row.room_no ?? null,
    platform: row.platform || "",
    checkIn: row.check_in ? utc(row.check_in).toISOString() : null,
  };
}

/** True when the guest passed the name + Machine ID check in the last few minutes. */
export function isVerified(row, now = new Date()) {
  if (!row?.verified_at) return false;
  return now - new Date(row.verified_at) <= VERIFIED_MINUTES * 60 * 1000;
}

/**
 * Check the guest's last name and Machine ID on the server.
 * Wrong answers are counted; too many lock the link for a while.
 */
export async function verifyPickup(sb, token, answers, now = new Date()) {
  const row = await loadPickup(sb, token);
  const state = linkState(row, now);
  if (state !== "ok") return { status: 410, body: { ok: false, state } };

  if (row.locked_until && now < new Date(row.locked_until)) {
    const minutes = Math.ceil((new Date(row.locked_until) - now) / 60000);
    return {
      status: 423,
      body: { ok: false, locked: true, minutes, error: `Too many wrong tries. Try again in ${minutes} min.` },
    };
  }

  const booking = { machineId: String(row.machine_id ?? "").toUpperCase(), clientLastName: row.client_last_name || "" };
  const result = checkAnswers(answers || {}, booking);

  if (!result.ok) {
    if (result.error === "Please fill all fields") return { status: 400, body: { ok: false, error: result.error } };
    const tries = (row.wrong_tries || 0) + 1;
    const patch =
      tries >= MAX_WRONG_TRIES
        ? { wrong_tries: 0, locked_until: new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() }
        : { wrong_tries: tries };
    await update(sb, token, patch);
    if (patch.locked_until) {
      return {
        status: 423,
        body: {
          ok: false,
          locked: true,
          minutes: LOCK_MINUTES,
          error: `Too many wrong tries. Try again in ${LOCK_MINUTES} min.`,
        },
      };
    }
    return { status: 401, body: { ok: false, error: result.error, triesLeft: MAX_WRONG_TRIES - tries } };
  }

  await update(sb, token, { verified_at: now.toISOString(), wrong_tries: 0, locked_until: null });
  return { status: 200, body: { ok: true } };
}

async function update(sb, token, patch) {
  const { error } = await sb.from(TABLE_NAME).update(patch).eq(TOKEN_COLUMN, token);
  if (error) throw error;
}

/** Call one signed machine link. Returns parsed JSON, { text }, or throws (code TIMEOUT when slow). */
async function callMachine(url, timeoutMs) {
  if (!url) throw new Error("missing machine link");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "KeyMatic-Server/1.0 (+https://keymatic.myotp.site)",
        Accept: "application/json, text/plain, */*",
      },
    });
    if (!r.ok) {
      const body = (await r.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`HTTP ${r.status} ${body}`);
    }
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error("timeout");
      // @ts-ignore
      err.code = "TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort extra call (LCD); never fails the action. */
async function tryMachine(url, timeoutMs) {
  if (!url) return;
  try {
    await callMachine(url, timeoutMs);
  } catch (e) {
    console.warn("[pickup] optional machine call failed:", e?.message);
  }
}

/** Best-effort entry in the machine log. */
async function logEvent(sb, row, kind, slot, detail) {
  try {
    const { error } = await sb.from("machine_events").insert([
      {
        machine_id: String(row.machine_id ?? "").toUpperCase(),
        slot,
        kind,
        uid: row.UID ?? null,
        room: row.room_no != null ? String(row.room_no) : null,
        detail,
      },
    ]);
    if (error) console.warn("[pickup] log failed:", error.message);
  } catch (e) {
    console.warn("[pickup] log failed:", e?.message);
  }
}

/** Ask the notify-pickup function to send the "key picked up" emails (best effort). */
async function sendPickupConfirmation(token, row) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2000);
  try {
    const r = await fetch(`${base}/functions/v1/notify-pickup`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        token,
        uid: row.UID ?? null,
        machineId: String(row.machine_id ?? "").toUpperCase(),
        roomNo: row.room_no ?? null,
      }),
    });
    if (!r.ok) console.warn("[pickup] notify-pickup returned", r.status);
    return r.ok;
  } catch (e) {
    console.warn("[pickup] notify-pickup failed:", e?.message);
    return false;
  } finally {
    clearTimeout(t);
  }
}

// Time budgets (ms). Netlify stops a server function after about 10 s,
// so every action stays well under that.
const T = { door: 4500, status: 2500, lcd: 1200, relay: 4500 };

/**
 * Run one guest action on the machine. Only the server calls the machine,
 * and only after the guest passed the check in the last few minutes.
 *   open    → unlock the door, confirm it opened, show the room on the LCD
 *   release → flash the slot on the LCD and release the key
 *   check   → is the key out? If yes: LCD off and finish the pickup
 * Returns { status, body: { result, error? } }.
 */
export async function runPickupAction(sb, token, action, now = new Date()) {
  const row = await loadPickup(sb, token);
  const state = linkState(row, now);
  if (state !== "ok") return { status: 410, body: { result: "closed", state } };
  if (!isVerified(row, now)) return { status: 401, body: { result: "unverified" } };

  // Each successful step keeps the guest verified for a few more minutes.
  const keepAlive = () => update(sb, token, { verified_at: new Date().toISOString() });

  try {
    if (action === "open") {
      const door = await callMachine(row.door_on_req, T.door);
      if (!isRelayOnSuccess(door)) {
        const reply = extractStatusText(door).slice(0, 200);
        console.warn("[pickup] door reply not OK:", reply);
        return { status: 200, body: { result: "offline", reason: `unexpected reply: ${reply}` } };
      }
      await new Promise((r) => setTimeout(r, 200));
      const limit = parseLimitSwitch(await callMachine(row.door_status_req, T.status));
      if (limit === "ON") return { status: 200, body: { result: "blocked" } };
      if (limit !== "OFF") return { status: 200, body: { result: "unknown", reason: `door reply: ${String(limit)}` } };
      await Promise.all([
        tryMachine(row.LCD_room_req, T.lcd),
        logEvent(sb, row, "door_unlocked", 0, "guest pickup (web)"),
        keepAlive(),
      ]);
      return { status: 200, body: { result: "open" } };
    }

    if (action === "release") {
      await tryMachine(row.LCD_flash_req, T.lcd);
      await callMachine(row.relay_on_req, T.relay);
      await Promise.all([
        logEvent(sb, row, "slot_unlocked", Number(row.slot_number) || null, "guest pickup (web)"),
        keepAlive(),
      ]);
      return { status: 200, body: { result: "released" } };
    }

    if (action === "check") {
      // The ESP reply is the first line on the bus, which can be "No response"
      // or another board's message. Ask twice before giving up (stays under the ~10 s server limit).
      let text = "";
      for (let i = 0; i < 2; i++) {
        const resp = await callMachine(row.relay_status_req, T.status);
        text = String(resp?.esp_response || extractStatusText(resp)).toUpperCase();
        if (text.includes("LIMIT") && (text.includes(":ON") || text.includes(":OFF"))) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (text.includes("LIMIT") && text.includes(":ON")) {
        await keepAlive();
        return { status: 200, body: { result: "still_in" } };
      }
      if (text.includes("LIMIT") && text.includes(":OFF")) {
        await tryMachine(row.LCD_off_req, T.lcd);
        const done = await completePickup(sb, token);
        if (done.status !== 200) console.warn("[pickup] complete failed:", done.status, done.body);
        const emailSent = await sendPickupConfirmation(token, row);
        return { status: 200, body: { result: "taken", emailSent } };
      }
      console.warn("[pickup] key status reply not understood:", text.slice(0, 200));
      return { status: 200, body: { result: "unknown", reason: `reply: ${text.slice(0, 80)}` } };
    }

    return { status: 400, body: { result: "bad_action" } };
  } catch (e) {
    // @ts-ignore
    if (e?.code === "TIMEOUT" || String(e?.message || "").startsWith("HTTP ")) {
      console.warn("[pickup] machine unreachable:", action, e?.message);
      return { status: 200, body: { result: "offline", reason: String(e?.message || "timeout").slice(0, 200) } };
    }
    console.warn("[pickup] machine call error:", action, e?.message);
    console.error("[pickup] action failed:", action, e);
    return { status: 500, body: { result: "error" } };
  }
}

/**
 * Mark a pickup as done: expire the link, mark the key out and clear its slot.
 * The key UID and machine come from the database, never from the browser.
 */
export async function completePickup(sb, token) {
  const row = await loadPickup(sb, token);
  if (!row) return { status: 404, body: { error: "Pickup link not found" } };
  if (row.valid === false) return { status: 409, body: { error: "Pickup already completed" } };
  const uid = await loadKeyUid(sb, row.room_no);
  const result = await invalidateByUID(sb, {
    token,
    uid,
    machineId: String(row.machine_id ?? "").toUpperCase(),
  });
  return { status: 200, body: { ok: true, ...result } };
}
