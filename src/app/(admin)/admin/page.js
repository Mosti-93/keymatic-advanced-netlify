"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/utils/supabaseClient";
import DataTable from "@/components/DataTable";
import { authHeaders } from "@/utils/requireRole";

const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);
const clean = (v) => String(v ?? "").trim();
const VIEW_KEY = "keymatic.overview.view";

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

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function guestName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Guest";
}

function Stat({ label, value, total, note, tone }) {
  return (
    <div className="k-card-flat !p-5">
      <p className="text-[13px] k-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        {value}
        {total !== undefined && <span className="text-lg font-normal k-faint"> / {total}</span>}
      </p>
      {note && <p className={`mt-1 text-[13px] ${tone === "warn" ? "text-[var(--k-orange)]" : "k-muted"}`}>{note}</p>}
    </div>
  );
}

function ViewSwitch({ view, onChange }) {
  const opts = [
    { key: "machines", label: "Machines" },
    { key: "table", label: "Table" },
  ];
  return (
    <div role="group" aria-label="Overview view" className="inline-flex rounded-full bg-[#e8e8ed] p-1">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={view === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition ${
            view === o.key ? "bg-white shadow-sm text-[var(--k-text)]" : "k-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OnlineBadge({ st }) {
  if (!st) return <span className="text-[12px] k-faint">Checking…</span>;
  if (!st.hasAddress) return <span className="text-[12px] k-faint">No Pi address</span>;
  return st.online ? (
    <span className="text-[12px] font-medium text-[var(--k-green)]">● Online</span>
  ) : (
    <span className="text-[12px] font-medium text-[var(--k-red)]" title={st.error || ""}>
      ● Offline
    </span>
  );
}

function MachineCard({ m, status }) {
  return (
    <article className="k-card-flat !p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-wide k-faint">{m.code}</p>
          <h3 className="text-[19px] font-semibold truncate">{m.name}</h3>
          {m.place && <p className="text-[13px] k-muted truncate">{m.place}</p>}
          <div className="mt-1">
            <OnlineBadge st={status} />
          </div>
        </div>
        <span className={m.used > 0 ? "k-badge-green" : "k-badge-gray"}>
          {m.used}/{m.capacity} used
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {m.slots.map((s) => (
          <div
            key={s.n}
            title={s.room ? `Slot ${s.n}: room ${s.room}` : `Slot ${s.n}: empty`}
            className={`h-12 rounded-lg flex flex-col items-center justify-center text-[11px] leading-tight border ${
              s.room
                ? "bg-[var(--k-accent)] border-[var(--k-accent)] text-white"
                : s.uid
                  ? "bg-[var(--k-orange-soft)] border-[var(--k-orange)] text-[var(--k-orange)]"
                  : "bg-white border-[var(--k-line)] k-faint"
            }`}
          >
            <span className="font-semibold">{s.n}</span>
            <span className="truncate max-w-full px-1">{s.room || (s.uid ? "?" : "—")}</span>
          </div>
        ))}
      </div>
      {m.outside.length > 0 && (
        <p className="rounded-lg bg-[var(--k-orange-soft)] px-3 py-2 text-[13px] text-[var(--k-orange)]">
          {m.outside.map((s) => `Room ${s.room} is reported in slot ${s.n}`).join(" · ")}, but this machine has{" "}
          {m.capacity} slots. Check the machine setup.
        </p>
      )}
      <div className="flex items-center justify-between border-t border-[var(--k-line)] pt-3 text-[13px] k-muted">
        <span>{m.capacity - m.used} free</span>
        <Link href="/create-machine" className="k-link">
          Manage
        </Link>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [slots, setSlots] = useState([]);
  const [view, setView] = useState("machines");
  const [online, setOnline] = useState(null); // { <machine_id>: { online, ms, error, hasAddress } }

  // Ask the server to check every Pi now and then every minute.
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch("/api/machines/status", { headers: await authHeaders(supabase), cache: "no-store" });
        const data = await res.json();
        if (!stop && res.ok) setOnline(data.machines || {});
      } catch {
        /* keep the last known status */
      }
    };
    check();
    const timer = setInterval(check, 60000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = window.localStorage.getItem(VIEW_KEY);
        if (saved === "machines" || saved === "table") setView(saved);
      } catch {
        /* storage unavailable: keep the default view */
      }
      setLoading(true);
      const results = await Promise.all([
        supabase.from("keys").select("*"),
        supabase.from("machines").select("*"),
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

  const changeView = (v) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  };

  const rows = useMemo(() => {
    const now = new Date();
    // keys.machine_id normally holds the machine code (e.g. "A12"); older rows may hold machines.id.
    const findMachine = (mid) =>
      machines.find((m) => clean(m.machine_id) === clean(mid)) || machines.find((m) => String(m.id) === String(mid));
    const inMachine = new Set(slots.filter((s) => s.UID).map((s) => clean(s.UID).toUpperCase()));

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
        present: k.UID ? inMachine.has(clean(k.UID).toUpperCase()) : null,
      };
    });
  }, [keys, machines, users, clients, slots]);

  // One card per machine, with each slot showing the room of the key inside it.
  const machineCards = useMemo(() => {
    const roomByUid = new Map(keys.filter((k) => k.UID).map((k) => [clean(k.UID).toUpperCase(), k.room_number || ""]));
    return machines
      .map((m) => {
        const code = clean(m.machine_id);
        const mine = slots.filter((s) => clean(s.machine_id) === code);
        const maxSlot = mine.reduce((n, s) => Math.max(n, parseInt(s.slot_number, 10) || 0), 0);
        // The machine's capacity (Machines page) decides how many slots are drawn.
        const capacity = parseInt(m.capacity, 10) || maxSlot || 10;
        // Keys the machine reports in a slot number above its capacity.
        const outside = mine
          .filter((s) => s.UID && (parseInt(s.slot_number, 10) || 0) > capacity)
          .map((s) => ({
            n: parseInt(s.slot_number, 10),
            room: roomByUid.get(clean(s.UID).toUpperCase()) || clean(s.UID),
          }));
        const bySlot = new Map(mine.map((s) => [parseInt(s.slot_number, 10), s]));
        const list = Array.from({ length: capacity }, (_, i) => {
          const s = bySlot.get(i + 1);
          const uid = s?.UID ? clean(s.UID).toUpperCase() : "";
          return { n: i + 1, uid, room: uid ? roomByUid.get(uid) || "" : "" };
        });
        return {
          id: m.id,
          code,
          name: m["Machine name"] || code,
          place: m.machine_address || m.location || "",
          capacity,
          used: list.filter((s) => s.uid).length,
          slots: list,
          outside,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [machines, slots, keys]);

  // Stays that overlap the next 7 days, soonest first.
  const week = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const roomByKey = new Map(keys.map((k) => [k.uuid, k.room_number]));
    return clients
      .map((c) => ({ ...c, _in: toDate(c.check_in), _out: toDate(c.check_out) }))
      .filter((c) => c._in && c._out && c._in < end && c._out >= start)
      .sort((a, b) => a._in - b._in)
      .map((c) => ({ ...c, room: roomByKey.get(c.key_id) || "—" }));
  }, [clients, keys]);

  const now = new Date();
  const today = now.toDateString();
  const stats = {
    keysIn: rows.filter((r) => r.present === true).length,
    keys: keys.length,
    staying: clients.filter((c) => toDate(c.check_in) <= now && now <= toDate(c.check_out)).length,
    arriving: clients.filter((c) => toDate(c.check_in)?.toDateString() === today).length,
    leaving: clients.filter((c) => toDate(c.check_out)?.toDateString() === today).length,
    relink: rows.filter((r) => !r.machine && !!r.machineRaw).length,
    free: machineCards.reduce((n, m) => n + (m.capacity - m.used), 0),
  };

  return (
    <div className="k-page">
      <div className="flex flex-wrap items-end justify-between gap-4 k-fade-in">
        <div>
          <p className="text-[13px] k-muted">
            {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            Overview
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewSwitch view={view} onChange={changeView} />
          <Link href="/add-client" className="k-btn-primary">
            New booking
          </Link>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="k-alert-error mt-6">
          <p className="font-medium">Some data couldn’t be loaded.</p>
          <ul className="mt-1 list-disc ml-5 text-[14px]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {stats.relink > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--k-orange)] bg-[var(--k-orange-soft)] px-4 py-3 text-[14px] text-[var(--k-orange)]">
          <span className="flex-1">
            {stats.relink} {stats.relink === 1 ? "key is" : "keys are"} linked to a machine that no longer exists.
          </span>
          <Link href="/link-owner" className="font-medium">
            Fix
          </Link>
        </div>
      )}

      <section aria-label="Key numbers" className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 k-fade-in-2">
        <Stat label="Keys in machines" value={loading ? "…" : stats.keysIn} total={loading ? undefined : stats.keys} />
        <Stat label="Guests staying" value={loading ? "…" : stats.staying} />
        <Stat
          label="Today"
          value={loading ? "…" : stats.arriving + stats.leaving}
          note={loading ? null : `${stats.arriving} arriving · ${stats.leaving} leaving`}
        />
        <Stat
          label={view === "machines" ? "Free slots" : "Needs relink"}
          value={loading ? "…" : view === "machines" ? stats.free : stats.relink}
          note={view === "machines" || loading ? null : stats.relink ? "Check the Link Owner page" : "All keys linked"}
          tone={stats.relink ? "warn" : undefined}
        />
      </section>

      {view === "machines" ? (
        <>
          <section aria-label="Machines" className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading
              ? [0, 1, 2].map((i) => <div key={i} className="k-card-flat h-64 animate-pulse" />)
              : machineCards.map((m) => (
                  <MachineCard key={m.id} m={m} status={online ? online[m.code] || { hasAddress: false } : null} />
                ))}
            {!loading && machineCards.length === 0 && <p className="k-muted">No machines yet.</p>}
          </section>

          <section className="mt-6 k-card-flat">
            <div className="flex items-center justify-between">
              <h2 className="text-[19px] font-semibold">Next 7 days</h2>
              <Link href="/add-client" className="k-link text-[14px]">
                All bookings
              </Link>
            </div>
            {!loading && week.length === 0 && <p className="mt-3 text-[14px] k-muted">No stays in the next 7 days.</p>}
            <ul className="mt-2">
              {week.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--k-line)] py-3"
                >
                  <span className="min-w-0 flex-1 font-medium">{guestName(c)}</span>
                  <span className="text-[14px] k-muted">Room {c.room}</span>
                  <span className="text-[14px] k-muted">
                    {fmtDay(c._in)} {fmtTime(c._in)} → {fmtDay(c._out)} {fmtTime(c._out)}
                  </span>
                  {c._in <= now && now <= c._out ? (
                    <span className="k-badge-green">Staying</span>
                  ) : (
                    <span className="k-badge-blue">Upcoming</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="mt-6">
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
                mobile: "subtitle",
                header: "Key",
                value: (r) => r.keyLabel,
                cell: (r) => <span className="font-medium">{r.keyLabel}</span>,
              },
              {
                key: "room",
                mobile: "title",
                mobileCell: (r) => (r.room && r.room !== "—" ? `Room ${r.room}` : r.keyLabel),
                header: "Room",
                value: (r) => (r.room === "—" ? "" : r.room),
                cell: (r) => r.room,
              },
              {
                key: "machine",
                mobile: "meta",
                mobileText: (r) =>
                  r.machine
                    ? r.machine["Machine name"] || r.machine.machine_id
                    : r.machineRaw
                      ? "Needs relink"
                      : "No machine",
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
                mobile: "meta",
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
                mobile: "meta",
                mobileText: (r) =>
                  r.client
                    ? `${r.clientIsCurrent ? "Now" : "Next"}: ${`${r.client.first_name || ""} ${r.client.last_name || ""}`.trim()}`
                    : "No booking",
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
                mobile: "badge",
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
            rowActions={(r) => (
              <Link
                href={!r.machine && r.machineRaw ? "/link-owner" : `/create-key?edit=${encodeURIComponent(r.id)}`}
                className="k-link text-[14px] px-2"
              >
                Edit
              </Link>
            )}
          />
        </div>
      )}
    </div>
  );
}
