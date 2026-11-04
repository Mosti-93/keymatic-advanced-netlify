'use client';
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/utils/supabaseClient";

const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);

function fmt(v) {
  const d = toDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const LINKS = [
  { href: "/create-key", label: "🔑 Keys", color: "bg-blue-600 hover:bg-blue-700" },
  { href: "/create-owner", label: "👤 Owners", color: "bg-purple-600 hover:bg-purple-700" },
  { href: "/create-machine", label: "🏭 Machines", color: "bg-green-600 hover:bg-green-700" },
  { href: "/users", label: "👥 Users", color: "bg-yellow-500 hover:bg-yellow-600" },
  { href: "/link-owner", label: "🔗 Link Owner", color: "bg-pink-500 hover:bg-pink-600" },
  { href: "/add-client", label: "🧳 Clients", color: "bg-indigo-500 hover:bg-indigo-600" },
];

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [slots, setSlots] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const results = await Promise.all([
        supabase.from("keys").select("*"),
        supabase.from("machines").select('id, machine_id, "Machine name", location'),
        supabase.from("users").select("id, name, email, role"),
        supabase.from("clients").select("id, first_name, last_name, email, key_id, check_in, check_out"),
        supabase.from("key_slot_presence").select("machine_id, slot_number, UID"),
      ]);
      const names = ["keys", "machines", "users", "clients", "key slots"];
      setErrors(results.map((r, i) => (r.error ? `${names[i]}: ${r.error.message}` : null)).filter(Boolean));
      setKeys(results[0].data || []);
      setMachines(results[1].data || []);
      setUsers(results[2].data || []);
      setClients(results[3].data || []);
      setSlots(results[4].data || []);
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.replace("/login");
  };

  const rows = useMemo(() => {
    const now = new Date();
    // keys.machine_id normally holds the machine code (e.g. "A12"); older rows may hold machines.id.
    const findMachine = (mid) =>
      machines.find((m) => String(m.machine_id) === String(mid)) ||
      machines.find((m) => String(m.id) === String(mid));
    const inMachine = new Set(slots.filter((s) => s.UID).map((s) => String(s.UID).toUpperCase()));

    return keys.map((k) => {
      const keyClients = clients
        .filter((c) => c.key_id && c.key_id === k.uuid)
        .map((c) => ({ ...c, _in: toDate(c.check_in), _out: toDate(c.check_out) }));
      const current = keyClients.find((c) => c._in && c._out && c._in <= now && now <= c._out);
      const next = keyClients
        .filter((c) => c._in && c._in > now)
        .sort((a, b) => a._in - b._in)[0];
      return {
        id: k.id,
        keyLabel: k.key_id || k.UID || k.uuid || k.id,
        room: k.room_number || "—",
        machine: findMachine(k.machine_id),
        machineRaw: k.machine_id,
        owner: users.find((u) => u.id === k.owner_id),
        client: current || next,
        clientIsCurrent: Boolean(current),
        present: k.UID ? inMachine.has(String(k.UID).toUpperCase()) : null,
      };
    });
  }, [keys, machines, users, clients, slots]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      r.keyLabel, r.room, r.machine?.["Machine name"], r.machine?.machine_id, r.owner?.name, r.owner?.email,
      r.client?.first_name, r.client?.last_name, r.client?.email,
    ].some((v) => String(v || "").toLowerCase().includes(q));
  });

  const now = new Date();
  const stats = [
    { label: "Machines", value: machines.length },
    { label: "Keys", value: keys.length },
    { label: "Owners", value: users.filter((u) => String(u.role || "").toLowerCase() === "owner").length },
    {
      label: "Guests staying now",
      value: clients.filter((c) => toDate(c.check_in) <= now && now <= toDate(c.check_out)).length,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Keymatic Dashboard</h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">
          Log out
        </button>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`flex items-center justify-center p-5 text-white rounded-xl shadow transition text-lg font-semibold ${l.color}`}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">{s.label}</div>
              <div className="text-3xl font-bold">{loading ? "…" : s.value}</div>
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="mb-6 p-4 rounded bg-red-50 text-red-700">
            <p className="font-semibold">Some data could not be loaded:</p>
            <ul className="list-disc ml-6">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">📋 Keys overview</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search key, room, machine, owner, guest…"
              className="border rounded px-3 py-2 w-full md:w-80"
            />
          </div>

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No keys found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-sm">
                <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                  <tr>
                    {["Key", "Room", "Machine", "Owner", "Guest", "In machine", ""].map((h) => (
                      <th key={h} className="px-3 py-2 border border-gray-200 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 align-top">
                      <td className="px-3 py-2 border border-gray-200 font-medium">{r.keyLabel}</td>
                      <td className="px-3 py-2 border border-gray-200">{r.room}</td>
                      <td className="px-3 py-2 border border-gray-200">
                        {r.machine ? (
                          <>
                            {r.machine["Machine name"] || r.machine.machine_id}
                            <div className="text-xs text-gray-500">{r.machine.machine_id}{r.machine.location ? ` · ${r.machine.location}` : ""}</div>
                          </>
                        ) : r.machineRaw ? (
                          <span className="text-orange-600">Unknown ({String(r.machineRaw)})</span>
                        ) : (
                          <span className="text-gray-400">Not linked</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        {r.owner ? (
                          <>
                            {r.owner.name || "—"}
                            <div className="text-xs text-gray-500">{r.owner.email}</div>
                          </>
                        ) : (
                          <span className="text-gray-400">No owner</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        {r.client ? (
                          <>
                            {`${r.client.first_name || ""} ${r.client.last_name || ""}`.trim() || r.client.email}
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${r.clientIsCurrent ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                              {r.clientIsCurrent ? "Now" : "Next"}
                            </span>
                            <div className="text-xs text-gray-500">{fmt(r.client.check_in)} → {fmt(r.client.check_out)}</div>
                          </>
                        ) : (
                          <span className="text-gray-400">No booking</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        {r.present === null ? <span className="text-gray-400">No UID</span> : r.present ? "✅ Yes" : "❌ No"}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        <Link href="/link-owner" className="text-blue-600 hover:underline">Edit</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
