// Server-only database access for the guest pickup flow.
// Guests are not signed in, so the browser must not read or write these tables
// directly (that is what lets Row Level Security lock them). These helpers run
// in API routes with the service role key and only ever act on the one booking
// that the secret link token points to.
import { createClient } from "@supabase/supabase-js";
import { TABLE_NAME, TOKEN_COLUMN, DB_COLUMNS, invalidateByUID } from "@/lib/pickup";

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing Supabase configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Booking row for a link token, or null when the token is unknown. */
export async function loadPickup(sb, token) {
  if (!token) return null;
  const { data, error } = await sb.from(TABLE_NAME).select(DB_COLUMNS).eq(TOKEN_COLUMN, token).maybeSingle();
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
  if (!row) return true;
  if (row.valid === false) return true;
  return row.check_out ? now > new Date(row.check_out) : false;
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
