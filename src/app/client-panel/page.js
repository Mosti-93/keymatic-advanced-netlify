"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import { useRequireRole, CheckingAccess } from "@/utils/useRequireRole";

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
  Current: "bg-green-100 text-green-700",
  Upcoming: "bg-blue-100 text-blue-700",
  Past: "bg-gray-100 text-gray-500",
  Unknown: "bg-gray-100 text-gray-500",
};

export default function ClientPanel() {
  const router = useRouter();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.replace("/login");
  };

  if (checking) return <CheckingAccess />;

  const now = new Date();
  const order = { Current: 0, Upcoming: 1, Past: 2, Unknown: 3 };
  const sorted = [...bookings].sort((a, b) => order[statusOf(a, now)] - order[statusOf(b, now)]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold">My stays</h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">
          Log out
        </button>
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4">
        <p className="mb-6 text-gray-600">
          Hello{profile?.name ? `, ${profile.name}` : ""}! Here are your bookings. Your key pickup link is sent to{" "}
          <span className="font-medium">{user?.email}</span> before check-in.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : error ? (
          <div className="p-4 rounded bg-red-50 text-red-700">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 bg-white rounded-lg shadow text-gray-600">
            No bookings found for this email yet. If you just booked, please check again later or contact your host.
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((b) => {
              const status = statusOf(b, now);
              return (
                <div key={b.id} className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-lg font-semibold">{b.room ? `Room ${b.room}` : "Your stay"}</div>
                    <span className={`text-xs px-2 py-1 rounded ${BADGE[status]}`}>{status}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Check-in:</span> {fmt(b.check_in)}</div>
                    <div><span className="text-gray-500">Check-out:</span> {fmt(b.check_out)}</div>
                    {b.machine && (
                      <div className="sm:col-span-2">
                        <span className="text-gray-500">Key pickup:</span>{" "}
                        {b.machine["Machine name"] || b.machine.machine_id}
                        {b.machine.machine_address || b.machine.location ? ` — ${b.machine.machine_address || b.machine.location}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
