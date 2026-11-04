"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useRequireRole, CheckingAccess } from "@/utils/useRequireRole";
import AppShell from "@/components/AppShell";

const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);

function statusOf(c, now) {
  const i = toDate(c.check_in);
  const o = toDate(c.check_out);
  if (!i || !o || isNaN(i) || isNaN(o)) return "Unknown";
  if (now < i) return "Upcoming";
  if (now > o) return "Past";
  return "Current";
}

function fmt(v) {
  const d = toDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const BADGE = {
  Current: "k-badge-green",
  Upcoming: "k-badge-blue",
  Past: "k-badge-gray",
  Unknown: "k-badge-gray",
};

export default function ClientPanel() {
  const { checking, user, profile } = useRequireRole(["client"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (checking || !user?.email) return;
    (async () => {
      setLoading(true);
      setError("");
      const email = user.email.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
      const { data, error: qErr } = await supabase
        .from("clients")
        .select("id, first_name, last_name, key_id, check_in, check_out, platform")
        .ilike("email", email)
        .order("check_in", { ascending: false });

      if (qErr) {
        setError("We couldn't load your bookings right now. Please try again later or contact your host.");
        setLoading(false);
        return;
      }

      const rows = data || [];
      const keyIds = [...new Set(rows.map((r) => r.key_id).filter(Boolean))];
      let keys = [];
      let machines = [];
      if (keyIds.length) {
        const { data: k } = await supabase.from("keys").select("uuid, room_number, machine_id").in("uuid", keyIds);
        keys = k || [];
        const mids = [...new Set(keys.map((x) => x.machine_id).filter(Boolean))];
        if (mids.length) {
          const { data: m } = await supabase
            .from("machines")
            .select('machine_id, "Machine name", location, machine_address')
            .in("machine_id", mids.map(String));
          machines = m || [];
        }
      }

      setBookings(
        rows.map((r) => {
          const key = keys.find((k) => k.uuid === r.key_id);
          const machine = key ? machines.find((m) => String(m.machine_id) === String(key.machine_id)) : null;
          return { ...r, room: key?.room_number, machine };
        })
      );
      setLoading(false);
    })();
  }, [checking, user]);


  if (checking) return <CheckingAccess />;

  const now = new Date();
  const order = { Current: 0, Upcoming: 1, Past: 2, Unknown: 3 };
  const sorted = [...bookings].sort((a, b) => order[statusOf(a, now)] - order[statusOf(b, now)]);

  const firstName = (profile?.name || "").split(" ")[0];

  return (
    <AppShell nav={[]} homeHref="/client-panel">
      <div className="k-page !max-w-3xl">
        <div className="k-fade-in">
          <p className="k-eyebrow">My stays</p>
          <h1 className="k-title mt-2">{firstName ? `Hi, ${firstName}.` : "Welcome."}</h1>
          <p className="k-subtitle">
            Your pickup link arrives at <span className="text-[#1d1d1f]">{user?.email}</span> before check-in.
          </p>
        </div>

        <div className="mt-10 k-fade-in-2">
          {loading ? (
            <div className="space-y-4">
              {[0, 1].map((i) => <div key={i} className="h-40 rounded-[18px] bg-black/[0.04] animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="k-alert-error">{error}</div>
          ) : sorted.length === 0 ? (
            <div className="k-card text-center">
              <div className="text-4xl">🧳</div>
              <h2 className="mt-4 text-xl font-semibold">No bookings yet</h2>
              <p className="mt-2 k-muted">If you just booked, check back soon or contact your host.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((b) => {
                const status = statusOf(b, now);
                return (
                  <div key={b.id} className={`k-card ${status === "Past" ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[13px] k-muted">{b.machine ? b.machine["Machine name"] || b.machine.machine_id : "Your stay"}</div>
                        <div className="mt-1 text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                          {b.room ? `Room ${b.room}` : "Booking"}
                        </div>
                      </div>
                      <span className={BADGE[status]}>{status}</span>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-[#f5f5f7] p-4">
                        <div className="text-[12px] uppercase tracking-wide k-faint">Check-in</div>
                        <div className="mt-1 font-medium">{fmt(b.check_in)}</div>
                      </div>
                      <div className="rounded-2xl bg-[#f5f5f7] p-4">
                        <div className="text-[12px] uppercase tracking-wide k-faint">Check-out</div>
                        <div className="mt-1 font-medium">{fmt(b.check_out)}</div>
                      </div>
                    </div>
                    {b.machine && (b.machine.machine_address || b.machine.location) && (
                      <div className="mt-4 text-[15px] k-muted">
                        📍 Key pickup: {b.machine.machine_address || b.machine.location}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
