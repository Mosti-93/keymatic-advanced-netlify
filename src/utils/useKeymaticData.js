"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { authHeaders } from "@/utils/requireRole";

/** How often the support screens reload while visible. */
export const REFRESH_MS = 15000;

/**
 * Loads everything the Overview / machine pages need and keeps it fresh:
 * reloads every REFRESH_MS while the tab is visible.
 * Pass `machine` to load only that machine's log.
 */
export function useKeymaticData({ machine = "", eventLimit = 200 } = {}) {
  const [data, setData] = useState({ keys: [], machines: [], users: [], clients: [], slots: [], events: [] });
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const eventsReq = (async () => {
        const qs = new URLSearchParams({ limit: String(eventLimit) });
        if (machine) qs.set("machine", machine);
        const r = await fetch(`/api/machines/events?${qs}`, {
          headers: await authHeaders(supabase),
          cache: "no-store",
        });
        const body = await r.json().catch(() => ({}));
        return r.ok ? { data: body.events || [] } : { error: { message: body.error || `HTTP ${r.status}` } };
      })().catch((e) => ({ error: { message: e.message } }));

      const results = await Promise.all([
        supabase.from("keys").select("*"),
        supabase.from("machines").select("*"),
        supabase.from("users").select("id, name, email, role"),
        supabase.from("clients").select("id, first_name, last_name, email, key_id, check_in, check_out"),
        supabase.from("key_slot_presence").select("machine_id, slot_number, UID, NON_REG_UID"),
        eventsReq,
      ]);
      const names = ["keys", "machines", "users", "bookings", "key slots", "machine log"];
      setErrors(results.map((r, i) => (r.error ? `${names[i]}: ${r.error.message}` : null)).filter(Boolean));
      // Keep the last good copy of a table if one reload fails.
      setData((prev) => ({
        keys: results[0].error ? prev.keys : results[0].data || [],
        machines: results[1].error ? prev.machines : results[1].data || [],
        users: results[2].error ? prev.users : results[2].data || [],
        clients: results[3].error ? prev.clients : results[3].data || [],
        slots: results[4].error ? prev.slots : results[4].data || [],
        events: results[5].error ? prev.events : results[5].data || [],
      }));
      setUpdatedAt(new Date());
      setLoading(false);
    } finally {
      busy.current = false;
    }
  }, [machine, eventLimit]);

  useEffect(() => {
    (async () => {
      await load();
    })();
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { ...data, errors, loading, updatedAt, reload: load };
}

/** Send a remote action to a machine. Resolves to { ok, result, message }. */
export async function runMachineCommand(code, action, { slot, reason } = {}) {
  try {
    const r = await fetch(`/api/machines/${encodeURIComponent(code)}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders(supabase)) },
      body: JSON.stringify({ action, slot, reason }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, result: "error", message: body.message || body.error || `HTTP ${r.status}` };
    return body;
  } catch (e) {
    return { ok: false, result: "error", message: e?.message || "Network error" };
  }
}
