'use client';
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/utils/supabaseClient";

const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);

function fmt(v) {
  const d = toDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const LINKS = [
  { href: "/create-key", label: "Keys", hint: "Add and edit keys", icon: "🔑" },
  { href: "/create-machine", label: "Machines", hint: "Machines and slots", icon: "🏭" },
  { href: "/add-client", label: "Guests", hint: "Bookings and pickups", icon: "🧳" },
  { href: "/create-owner", label: "Owners", hint: "Property owners", icon: "👤" },
  { href: "/link-owner", label: "Link Owner", hint: "Assign keys", icon: "🔗" },
  { href: "/users", label: "Users", hint: "Roles and access", icon: "👥" },
];

export default function Dashboard() {
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

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  return (
    <div className="k-page">
      <div className="k-fade-in">
        <p className="k-eyebrow">Overview</p>
        <h1 className="k-title mt-2">{greeting}</h1>
        <p className="k-subtitle">Here’s everything happening across your machines.</p>
      </div>

      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 k-fade-in-2">
        {stats.map((s) => (
          <div key={s.label} className="k-card !p-6">
            <div className="text-[13px] k-muted">{s.label}</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              {loading ? <span className="inline-block h-9 w-12 rounded-lg bg-black/5 animate-pulse" /> : s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 k-fade-in-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="k-tile">
            <div className="text-2xl">{l.icon}</div>
            <div className="mt-3 text-[17px] font-semibold">{l.label}</div>
            <div className="text-[14px] k-muted">{l.hint}</div>
          </Link>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="k-alert-error mt-8">
          <p className="font-medium">Some data couldn’t be loaded.</p>
          <ul className="mt-1 list-disc ml-5 text-[14px]">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <section className="k-card mt-10 !p-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 sm:p-8 pb-4 sm:pb-4">
          <div>
            <h2 className="k-h2">Keys</h2>
            <p className="text-[14px] k-muted mt-1">Every key, where it is, and who it’s for.</p>
          </div>
          <div className="relative w-full md:w-80">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5.2" fill="none" stroke="#86868b" strokeWidth="1.6" />
              <path d="M11 11l3.5 3.5" stroke="#86868b" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="k-input !pl-10 !py-2.5 !rounded-full !bg-[#f5f5f7] !border-transparent" />
          </div>
        </div>

        {loading ? (
          <div className="px-8 pb-8 space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-black/[0.04] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-8 pb-10 k-muted">No keys match your search.</p>
        ) : (
          <>
          {/* Phones: one card per key */}
          <div className="md:hidden px-4 pb-4 space-y-3">
            {filtered.map((r) => (
              <Link key={r.id} href="/link-owner" className="block rounded-2xl bg-[#f5f5f7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{r.keyLabel}</div>
                    <div className="text-[13px] k-muted">Room {r.room}</div>
                  </div>
                  {r.present === null ? null : r.present ? (
                    <span className="k-badge-green">● In machine</span>
                  ) : (
                    <span className="k-badge-gray">Out</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <div className="k-faint">Machine</div>
                    {r.machine ? (
                      <div>{r.machine["Machine name"] || r.machine.machine_id}</div>
                    ) : r.machineRaw ? (
                      <span className="k-badge-orange">Relink</span>
                    ) : (
                      <div className="k-faint">Not linked</div>
                    )}
                  </div>
                  <div>
                    <div className="k-faint">Owner</div>
                    <div className="truncate">{r.owner?.name || "—"}</div>
                  </div>
                </div>
                {r.client && (
                  <div className="mt-3 text-[13px]">
                    <span className={r.clientIsCurrent ? "k-badge-green" : "k-badge-blue"}>{r.clientIsCurrent ? "Now" : "Next"}</span>{" "}
                    {`${r.client.first_name || ""} ${r.client.last_name || ""}`.trim()}
                    <div className="k-faint mt-1">{fmt(r.client.check_in)} → {fmt(r.client.check_out)}</div>
                  </div>
                )}
              </Link>
            ))}
          </div>

          {/* Larger screens: table */}
          <div className="hidden md:block overflow-x-auto px-2 sm:px-4 pb-4">
            <table className="k-table">
              <thead>
                <tr>
                  {["Key", "Room", "Machine", "Owner", "Guest", "In machine", ""].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.keyLabel}</td>
                    <td>{r.room}</td>
                    <td>
                      {r.machine ? (
                        <>
                          <div>{r.machine["Machine name"] || r.machine.machine_id}</div>
                          <div className="text-[12px] k-faint">{r.machine.machine_id}</div>
                        </>
                      ) : r.machineRaw ? (
                        <span className="k-badge-orange">Unknown · relink</span>
                      ) : (
                        <span className="k-faint">Not linked</span>
                      )}
                    </td>
                    <td>
                      {r.owner ? (
                        <>
                          <div>{r.owner.name || "—"}</div>
                          <div className="text-[12px] k-faint">{r.owner.email}</div>
                        </>
                      ) : (
                        <span className="k-faint">No owner</span>
                      )}
                    </td>
                    <td>
                      {r.client ? (
                        <>
                          <div className="flex items-center gap-2">
                            {`${r.client.first_name || ""} ${r.client.last_name || ""}`.trim() || r.client.email}
                            <span className={r.clientIsCurrent ? "k-badge-green" : "k-badge-blue"}>{r.clientIsCurrent ? "Now" : "Next"}</span>
                          </div>
                          <div className="text-[12px] k-faint">{fmt(r.client.check_in)} → {fmt(r.client.check_out)}</div>
                        </>
                      ) : (
                        <span className="k-faint">No booking</span>
                      )}
                    </td>
                    <td>
                      {r.present === null ? (
                        <span className="k-faint">—</span>
                      ) : r.present ? (
                        <span className="k-badge-green">● In machine</span>
                      ) : (
                        <span className="k-badge-gray">Out</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link href="/link-owner" className="k-link text-[14px]">Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
