// Helpers for the guest pickup flow (/pickup/[token]).
// Pure functions + one DB routine, kept out of the page so they can be tested.

export const TABLE_NAME = "pickup_requests";
export const TOKEN_COLUMN = "link_token";
export const DB_COLUMNS =
  "client_first_name,client_last_name,machine_id,room_no,check_out,valid,machine_name,city,machine_address,platform,door_on_req,door_status_req,relay_on_req,relay_status_req,LCD_room_req,LCD_flash_req,LCD_off_req";

export function formatName(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}

export function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .then(async (r) => {
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    })
    .catch((err) => {
      clearTimeout(t);
      if (err.name === "AbortError") {
        const e = new Error("timeout");
        // @ts-ignore
        e.code = "TIMEOUT";
        throw e;
      }
      throw err;
    });
}

export async function invalidateByUID(supabase, { token, uid, machineId }) {
  const isoNow = new Date().toISOString();
  const result = { linkUpdated: false, keyUpdated: false, slotsCleared: 0 };
  if (!token) throw new Error("Missing token");

  try {
    {
      const { error } = await supabase
        .from(TABLE_NAME)
        .update({ valid: false, pulled_at: isoNow })
        .eq(TOKEN_COLUMN, token);
      if (error) throw error;
      result.linkUpdated = true;
    }

    if (uid) {
      const { error } = await supabase
        .from("keys")
        .update({
          isPresent: "OUT",
          last_status_time: isoNow,
          statusText: "KEY_REMOVED",
        })
        .eq("UID", uid);
      if (error) throw error;
      result.keyUpdated = true;
    } else {
      console.warn("[invalidateByUID] No UID provided; skipping keys and slot clear.");
      return result;
    }

    let q1 = supabase
      .from("key_slot_presence")
      .update({
        UID: null,
      })
      .eq("UID", uid);

    if (machineId) q1 = q1.eq("machine_id", String(machineId).toUpperCase());

    let { data: upd1, error: e1 } = await q1.select("*");
    if (e1) throw e1;
    let affected = upd1?.length ?? 0;

    if (affected === 0) {
      const { data: upd2, error: e2 } = await supabase
        .from("key_slot_presence")
        .update({
          UID: null,
        })
        .eq("UID", uid)
        .select("*");
      if (e2) throw e2;
      affected = upd2?.length ?? 0;
    }

    if (affected === 0 && typeof uid === "string") {
      const variants = [uid.toUpperCase(), uid.toLowerCase()];
      for (const v of variants) {
        const { data: upd4, error: e4 } = await supabase
          .from("key_slot_presence")
          .update({
            UID: null,
          })
          .eq("UID", v)
          .select("*");
        if (e4) throw e4;
        affected = upd4?.length ?? 0;
        if (affected > 0) break;
      }
    }

    result.slotsCleared = affected;
    if (affected === 0) {
      console.warn("[invalidateByUID] No key_slot_presence row cleared for UID:", uid, "machine:", machineId);
    }

    return result;
  } catch (err) {
    console.error("invalidateByUID error:", err);
    throw err;
  }
}

export function extractStatusText(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.text === "string") return r.text;
  if (typeof r.status === "string") return r.status;
  if (typeof r.message === "string") return r.message;
  try {
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}

export function isRelayOnSuccess(resp) {
  const s = extractStatusText(resp);
  return s.includes("Pi relay turned ON");
}

export function parseLimitSwitch(resp) {
  const s = extractStatusText(resp).toUpperCase();
  if (s.includes("LIMIT SWITCH IS OFF")) return "OFF";
  if (s.includes("LIMIT SWITCH IS ON")) return "ON";
  return "UNKNOWN";
}

/** Normalize the [token] route param to a single string. */
export function normalizeToken(token) {
  if (typeof token === "string") return token;
  if (Array.isArray(token)) return token[0] ?? "";
  return String(token ?? "");
}

/**
 * Compare the guest's answers with the booking.
 * Returns { ok: boolean, error: string } (error is "" when ok).
 */
export function checkAnswers({ lastName, machineId }, booking) {
  if (!booking) return { ok: false, error: "Data not loaded yet" };

  const enteredMachineId = (Array.isArray(machineId) ? machineId.join("") : String(machineId || ""))
    .toUpperCase()
    .trim();
  const dbMachineId = (booking.machineId || "").toUpperCase().trim();
  const enteredLastName = (lastName || "").trim().toLowerCase();
  const dbLastName = (booking.clientLastName || "").toLowerCase().trim();

  if (!enteredLastName || !enteredMachineId) return { ok: false, error: "Please fill all fields" };

  const nameOk = enteredLastName === dbLastName;
  const idOk = enteredMachineId === dbMachineId;
  if (!nameOk && !idOk) return { ok: false, error: "❌ Both last name and machine ID are incorrect." };
  if (!nameOk) return { ok: false, error: "❌ Incorrect last name." };
  if (!idOk) return { ok: false, error: "❌ Incorrect machine ID." };
  return { ok: true, error: "" };
}
