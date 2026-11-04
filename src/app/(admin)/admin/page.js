"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/utils/supabaseClient";
import DataTable from "@/components/DataTable";

const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);

function fmt(v) {
  const d = toDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      machines.find((m) => String(m.machine_id) === String(mid)) || machines.find((m) => String(m.id) === String(mid));
    const inMachine = new Set(slots.filter((s) => s.UID).map((s) => String(s.UID).toUpperCase()));

    return keys.map((k) => {
      const keyClients = clients
        .filter((c) => c.key_id && c.key_id === k.uuid)
        .map((c) => ({ ...c, _in: toDate(c.check_in), _out: toDate(c.check_out) }));
      const current = keyClients.find((c) => c._in && c._out && c._in <= now && now <= c._out);
      const next = keyClients.filter((c) => c._in && c._in > now).sort((a, b) => a._in - b._in)[0];
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
          <ul className="mt-1 list-disc ml-5 text-[14px]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <DataTable
          title="Keys"
          subtitle="Every key, where it is, and who it’s for."
          rows={rows}
          loading={loading}
          exportName="keys-overview"
          searchPlaceholder="Search key, room, machine, owner, guest"
          defaultSort={{ key: "room", dir: "asc" }}
          emptyText="No keys yet."
          filters={[
            { key: "all", label: "All", test: () => true },
            { key: "in", label: "In machine", test: (r) => r.present === true },
            { key: "out", label: "Out", test: (r) => r.present === false },
            { key: "now", label: "Guest staying", test: (r) => r.clientIsCurrent },
            { key: "relink", label: "Needs relink", test: (r) => !r.machine && !!r.machineRaw },
          ]}
          columns={[
            {
              key: "key",
              header: "Key",
              mobile: "title",
              value: (r) => r.keyLabel,
              cell: (r) => <span className="font-medium">{r.keyLabel}</span>,
            },
            {
              key: "room",
              header: "Room",
              mobile: "subtitle",
              value: (r) => (r.room === "—" ? "" : r.room),
              cell: (r) => r.room,
            },
            {
              key: "machine",
              header: "Machine",
              value: (r) => (r.machine ? `${r.machine["Machine name"] || ""} ${r.machine.machine_id}` : ""),
              cell: (r) =>
                r.machine ? (
                  <>
                    <div>{r.machine["Machine name"] || r.machine.machine_id}</div>
                    <div className="text-[12px] k-faint">{r.machine.machine_id}</div>
                  </>
                ) : r.machineRaw ? (
                  <span className="k-badge-orange">Unknown · relink</span>
                ) : (
                  <span className="k-faint">Not linked</span>
                ),
            },
            {
              key: "owner",
              header: "Owner",
              value: (r) => r.owner?.name || "",
              cell: (r) =>
                r.owner ? (
                  <>
                    <div>{r.owner.name || "—"}</div>
                    <div className="text-[12px] k-faint">{r.owner.email}</div>
                  </>
                ) : (
                  <span className="k-faint">No owner</span>
                ),
            },
            {
              key: "guest",
              header: "Guest",
              value: (r) => (r.client ? `${r.client.first_name || ""} ${r.client.last_name || ""}`.trim() : ""),
              cell: (r) =>
                r.client ? (
                  <>
                    <div className="flex items-center gap-2">
                      {`${r.client.first_name || ""} ${r.client.last_name || ""}`.trim() || r.client.email}
                      <span className={r.clientIsCurrent ? "k-badge-green" : "k-badge-blue"}>
                        {r.clientIsCurrent ? "Now" : "Next"}
                      </span>
                    </div>
                    <div className="text-[12px] k-faint">
                      {fmt(r.client.check_in)} → {fmt(r.client.check_out)}
                    </div>
                  </>
                ) : (
                  <span className="k-faint">No booking</span>
                ),
            },
            {
              key: "present",
              header: "Status",
              value: (r) => (r.present === null ? "" : r.present ? "In machine" : "Out"),
              cell: (r) =>
                r.present === null ? null : r.present ? (
                  <span className="k-badge-green">● In machine</span>
                ) : (
                  <span className="k-badge-gray">Out</span>
                ),
            },
          ]}
          rowActions={() => (
            <Link href="/link-owner" className="k-link text-[14px] px-2">
              Edit
            </Link>
          )}
        />
      </div>
    </div>
  );
}
