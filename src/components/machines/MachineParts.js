"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import DataTable from "@/components/DataTable";
import {
  KEY_STATES,
  eventGroup,
  eventLabel,
  eventTime,
  fmtAgo,
  fmtShort,
  fmtTime,
  slotRows,
  sortEvents,
} from "@/lib/machineView";

const machineHref = (code) => `/machines/${encodeURIComponent(code)}`;

// ---------- machine status ----------

export function StatusBadges({ m }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {m.online === null ? (
        <span className="k-badge-gray" title="This machine has not reported a heartbeat yet">
          No heartbeat
        </span>
      ) : (
        <span
          className={m.online ? "k-badge-green" : "k-badge-red"}
          title={m.lastSeen ? `Last seen ${m.lastSeen.toLocaleString()}` : ""}
        >
          {m.online ? "● Online" : "○ Offline"}
          {m.lastSeen && <span className="ml-1 font-normal opacity-80">· {fmtAgo(m.lastSeen)}</span>}
        </span>
      )}
      {m.door && (
        <span
          className={m.door === "closed" ? "k-badge-green" : m.doorOpenTooLong ? "k-badge-red" : "k-badge-orange"}
          title={m.doorAt ? `Since ${m.doorAt.toLocaleString()}` : ""}
        >
          {m.door === "closed" ? "Door closed" : `Door open${m.doorAt ? ` · ${fmtAgo(m.doorAt, "")}` : ""}`}
        </span>
      )}
    </div>
  );
}

/** One bar for the whole machine: keys inside, linked keys that are out, unregistered keys, free. */
export function CapacityBar({ m }) {
  const pct = (n) => `${(n / Math.max(m.capacity, 1)) * 100}%`;
  const parts = [
    { n: m.regIn, cls: "bg-[var(--k-accent)]", label: "in machine" },
    { n: m.unregIn, cls: "bg-[var(--k-orange)]", label: "unregistered" },
    {
      n: Math.min(m.linkedOut, Math.max(0, m.capacity - m.regIn - m.unregIn)),
      cls: "bg-[#9cc7f5]",
      label: "linked, out",
    },
  ];
  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#e8e8ed]"
        role="img"
        aria-label={`${m.inCount} of ${m.capacity} in, ${m.linked} of ${m.capacity} linked`}
      >
        {parts.map((p) =>
          p.n > 0 ? (
            <div key={p.label} className={p.cls} style={{ width: pct(p.n) }} title={`${p.n} ${p.label}`} />
          ) : null
        )}
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="k-faint">In</dt>
          <dd className="font-semibold">
            {m.inCount}
            <span className="font-normal k-faint">/{m.capacity}</span>
          </dd>
        </div>
        <div>
          <dt className="k-faint">Linked</dt>
          <dd className={`font-semibold ${m.overLinked ? "text-[var(--k-red)]" : ""}`}>
            {m.linked}
            <span className="font-normal k-faint">/{m.capacity}</span>
          </dd>
        </div>
        <div>
          <dt className="k-faint">Can link</dt>
          <dd className="font-semibold">{m.freeToLink}</dd>
        </div>
      </dl>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] k-faint">
        <Legend cls="bg-[var(--k-accent)]">in ({m.regIn})</Legend>
        {m.unregIn > 0 && <Legend cls="bg-[var(--k-orange)]">unregistered ({m.unregIn})</Legend>}
        <Legend cls="bg-[#9cc7f5]">linked, out ({m.linkedOut})</Legend>
        <Legend cls="bg-[#e8e8ed]">empty ({m.freeSlots})</Legend>
      </p>
    </div>
  );
}

function Legend({ cls, children }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />
      {children}
    </span>
  );
}

export function slotTitle(s) {
  if (s.unreg) return `Slot ${s.n}: unregistered key ${s.uid}`;
  if (s.key)
    return `Slot ${s.n}: ${s.room ? `room ${s.room}` : s.keyLabel}${s.foreign ? " (linked to another machine)" : ""}`;
  if (s.uid) return `Slot ${s.n}: key ${s.uid}`;
  return `Slot ${s.n}: empty`;
}

/**
 * Slot grid laid out like the real machine: rows of 5, 4, 5, 4, …
 * The 4-slot rows sit half a slot in, like the staggered front panel.
 * With onSlotClick each slot is a button.
 */
export function SlotGrid({ m, onSlotClick, large = false, busySlot }) {
  return (
    <div className={`flex flex-col ${large ? "gap-2" : "gap-1.5"}`}>
      {slotRows(m.slots).map((row, r) => (
        <div key={r} className={`grid grid-cols-10 ${large ? "gap-2" : "gap-1.5"}`}>
          {row.map((s, i) => {
            const cls = s.unreg
              ? "bg-[var(--k-orange-soft)] border-[var(--k-orange)] text-[var(--k-orange)]"
              : s.key && !s.foreign
                ? "bg-[var(--k-accent)] border-[var(--k-accent)] text-white"
                : s.uid
                  ? "bg-[var(--k-accent-soft)] border-[var(--k-accent)] text-[var(--k-accent)]"
                  : "bg-white border-[var(--k-line)] k-faint";
            const label = s.unreg ? "Unreg." : s.room || s.keyLabel || (s.uid ? "?" : "—");
            const inner = (
              <>
                <span className="font-semibold">{s.n}</span>
                <span className="truncate max-w-full px-1">{busySlot === s.n ? "…" : label}</span>
              </>
            );
            const place = `col-span-2 ${i === 0 && row.length === 4 ? "col-start-2" : ""}`;
            const base = `${place} ${large ? "h-16 text-[13px]" : "h-12 text-[11px]"} min-w-0 rounded-lg flex flex-col items-center justify-center leading-tight border ${cls}`;
            return onSlotClick ? (
              <button
                key={s.n}
                type="button"
                title={slotTitle(s)}
                onClick={() => onSlotClick(s)}
                className={`${base} transition hover:ring-2 hover:ring-[var(--k-accent)] hover:ring-offset-1 focus-visible:ring-2 focus-visible:ring-[var(--k-accent)]`}
              >
                {inner}
              </button>
            ) : (
              <div key={s.n} title={slotTitle(s)} className={base}>
                {inner}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Problems for one machine, shown inside its card. */
export function MachineAlerts({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {alerts.map((a, i) => (
        <li
          key={i}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ${
            a.tone === "red"
              ? "bg-[var(--k-red-soft)] text-[var(--k-red)]"
              : "bg-[var(--k-orange-soft)] text-[var(--k-orange)]"
          }`}
        >
          <span aria-hidden="true">{a.tone === "red" ? "⚠︎" : "!"}</span>
          <span>{a.short || a.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Overview card. The whole card opens the machine page. */
export function MachineCard({ m, alerts = [] }) {
  return (
    <Link
      href={machineHref(m.code)}
      className="k-card-flat !p-5 flex flex-col gap-4 transition hover:shadow-[var(--k-shadow)] focus-visible:ring-2 focus-visible:ring-[var(--k-accent)]"
      aria-label={`Open machine ${m.name} (${m.code})`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-wide k-faint">{m.code}</p>
          <h3 className="text-[19px] font-semibold truncate text-[var(--k-text)]">{m.name}</h3>
          {m.place && <p className="text-[13px] k-muted truncate">{m.place}</p>}
        </div>
        <span className="k-link text-[13px] shrink-0">Open →</span>
      </div>
      <StatusBadges m={m} />
      <MachineAlerts alerts={alerts} />
      <CapacityBar m={m} />
      <SlotGrid m={m} />
      {m.outside.length > 0 && (
        <p className="rounded-lg bg-[var(--k-orange-soft)] px-3 py-2 text-[13px] text-[var(--k-orange)]">
          {m.outside.map((s) => `Room ${s.room} is reported in slot ${s.n}`).join(" · ")}, but this machine has{" "}
          {m.capacity} slots. Check the machine setup.
        </p>
      )}
    </Link>
  );
}

/** Table version of the machine cards. */
export function MachinesTable({ cards, loading, alertsByMachine = new Map() }) {
  return (
    <DataTable
      title="Machines"
      rows={cards}
      loading={loading}
      getRowId={(m) => m.id}
      exportName="machines"
      searchPlaceholder="Search code, name, address"
      defaultSort={{ key: "code", dir: "asc" }}
      emptyText="No machines yet."
      onRowClick={(m) => window.location.assign(machineHref(m.code))}
      filters={[
        { key: "all", label: "All", test: () => true },
        { key: "offline", label: "Offline", test: (m) => m.online === false },
        { key: "door", label: "Door open", test: (m) => m.door === "open" },
        { key: "unreg", label: "Unregistered keys", test: (m) => m.unregIn > 0 },
      ]}
      columns={[
        { key: "code", header: "Code", mobile: "subtitle", cell: (m) => <span className="font-medium">{m.code}</span> },
        {
          key: "name",
          header: "Name",
          mobile: "title",
          cell: (m) => (
            <>
              <div>{m.name}</div>
              <div className="text-[12px] k-faint">{m.place}</div>
            </>
          ),
        },
        {
          key: "online",
          header: "Status",
          mobile: "badge",
          value: (m) => (m.online === null ? "No heartbeat" : m.online ? "Online" : "Offline"),
          cell: (m) => <StatusBadges m={m} />,
        },
        {
          key: "in",
          header: "In",
          value: (m) => m.inCount,
          cell: (m) => `${m.inCount}/${m.capacity}`,
          mobile: "meta",
          mobileText: (m) => `${m.inCount}/${m.capacity} in`,
        },
        {
          key: "linked",
          header: "Linked",
          value: (m) => m.linked,
          cell: (m) => `${m.linked}/${m.capacity}`,
          mobile: "meta",
          mobileText: (m) => `${m.linked}/${m.capacity} linked`,
        },
        { key: "free", header: "Can link", value: (m) => m.freeToLink },
        {
          key: "alerts",
          header: "Alerts",
          value: (m) => (alertsByMachine.get(m.code) || []).map((a) => a.short).join(" · "),
          cell: (m) => <MachineAlerts alerts={alertsByMachine.get(m.code)} />,
        },
        {
          key: "unreg",
          header: "Unreg.",
          value: (m) => m.unregIn,
          cell: (m) => (m.unregIn ? <span className="k-badge-orange">{m.unregIn}</span> : "—"),
        },
      ]}
    />
  );
}

// ---------- alerts ----------

export function AlertsStrip({ alerts }) {
  if (!alerts.length) return null;
  return (
    <section aria-label="Alerts" className="mt-6 space-y-2">
      {alerts.map((a, i) => {
        const cls =
          a.tone === "red"
            ? "border-[var(--k-red)] bg-[var(--k-red-soft)] text-[var(--k-red)]"
            : "border-[var(--k-orange)] bg-[var(--k-orange-soft)] text-[var(--k-orange)]";
        return (
          <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[14px] ${cls}`}>
            <span aria-hidden="true">{a.tone === "red" ? "⚠︎" : "!"}</span>
            <span className="flex-1">{a.text}</span>
            {a.href && (
              <Link href={a.href} className="font-medium shrink-0">
                {a.href.startsWith("#") ? "See" : "Open"}
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------- key status ----------

export function KeyStatusTable({ rows, loading, users = [], showMachine = true, title = "Keys", subtitle }) {
  const ownerById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const filters = [
    { key: "all", label: "All", test: () => true },
    ...Object.entries(KEY_STATES).map(([k, v]) => ({ key: k, label: v.label, test: (r) => r.state === k })),
  ];
  const columns = [
    {
      key: "room",
      header: "Key",
      mobile: "title",
      value: (r) => (r.room ? `Room ${r.room}` : r.keyLabel),
      cell: (r) => (
        <>
          <div className="font-medium">{r.room ? `Room ${r.room}` : r.keyLabel}</div>
          <div className="text-[12px] k-faint">
            {r.keyLabel}
            {r.uid ? ` · ${r.uid}` : ""}
          </div>
        </>
      ),
    },
    showMachine && {
      key: "machine",
      header: "Machine",
      mobile: "meta",
      value: (r) => r.machineCode,
      mobileText: (r) => r.machineName || r.machineCode || "No machine",
      cell: (r) =>
        r.machineCode ? (
          r.machineKnown ? (
            <Link href={machineHref(r.machineCode)} className="k-link" onClick={(e) => e.stopPropagation()}>
              {r.machineName || r.machineCode}
              <div className="text-[12px] k-faint">{r.machineCode}</div>
            </Link>
          ) : (
            <span className="k-badge-orange">Unknown · relink</span>
          )
        ) : (
          <span className="k-faint">Not linked</span>
        ),
    },
    {
      key: "slot",
      header: "Slot",
      value: (r) => r.slot ?? "",
      cell: (r) =>
        r.slot ? (r.slotMachine && r.slotMachine !== r.machineCode ? `${r.slotMachine} · ${r.slot}` : r.slot) : "—",
    },
    {
      key: "state",
      header: "Status",
      mobile: "badge",
      value: (r) => r.label,
      cell: (r) => (
        <>
          <span className={r.badge}>{r.label}</span>
          <div className="mt-1 text-[12px] k-faint max-w-[260px]">{r.detail}</div>
        </>
      ),
      mobileCell: (r) => <span className={r.badge}>{r.label}</span>,
    },
    {
      key: "since",
      header: "Since",
      value: (r) => r.since?.getTime() || 0,
      cell: (r) => (r.since ? <span title={r.since.toLocaleString()}>{fmtShort(r.since)}</span> : "—"),
      mobile: "meta",
      mobileText: (r) => r.detail,
    },
    {
      key: "owner",
      header: "Owner",
      value: (r) => ownerById.get(r.ownerId)?.name || "",
      cell: (r) => ownerById.get(r.ownerId)?.name || <span className="k-faint">—</span>,
    },
  ].filter(Boolean);

  return (
    <DataTable
      title={title}
      subtitle={subtitle}
      rows={rows}
      loading={loading}
      exportName="key-status"
      searchPlaceholder="Search room, key, UID, guest, machine"
      emptyText="No keys."
      filters={filters}
      columns={columns}
      rowClassName={(r) => (r.state === "overdue" ? "!bg-[var(--k-red-soft)]" : "")}
      rowActions={(r) => (
        <Link
          href={`/create-key?edit=${encodeURIComponent(r.id)}`}
          className="k-link text-[14px] px-2"
          onClick={(e) => e.stopPropagation()}
        >
          Edit
        </Link>
      )}
    />
  );
}

// ---------- upcoming ----------

const UPCOMING_BADGE = {
  overdue: ["k-badge-red", "Not returned"],
  pickup: ["k-badge-blue", "Pickup"],
  return: ["k-badge-gray", "Return"],
};

export function UpcomingList({ items, loading, showMachine = true }) {
  return (
    <section className="k-card-flat">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[19px] font-semibold">Upcoming</h2>
          <p className="text-[13px] k-muted">Pickups and returns in the next 48 hours, keys not returned first.</p>
        </div>
        <Link href="/add-client" className="k-link text-[14px]">
          All bookings
        </Link>
      </div>
      {!loading && items.length === 0 && <p className="mt-3 text-[14px] k-muted">Nothing due in the next 48 hours.</p>}
      <ul className="mt-2">
        {items.map((e, i) => {
          const [badge, label] = UPCOMING_BADGE[e.type];
          return (
            <li
              key={`${e.type}-${e.clientId}-${i}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--k-line)] py-3"
            >
              <span className={badge}>{e.type === "pickup" && e.late ? "Pickup · late" : label}</span>
              <span className="min-w-0 flex-1 font-medium">{e.guest}</span>
              <span className="text-[14px] k-muted">{e.room ? `Room ${e.room}` : e.keyLabel}</span>
              {showMachine && e.machineCode && (
                <Link href={machineHref(e.machineCode)} className="text-[14px] k-link">
                  {e.machineCode}
                </Link>
              )}
              <span className={`text-[14px] ${e.type === "overdue" ? "text-[var(--k-red)]" : "k-muted"}`}>
                {e.type === "overdue"
                  ? `since ${fmtShort(e.at)}`
                  : isToday(e.at)
                    ? `Today ${fmtTime(e.at)}`
                    : fmtShort(e.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function isToday(d) {
  return d && d.toDateString() === new Date().toDateString();
}

// ---------- machine log ----------

const LOG_FILTERS = [
  { key: "all", label: "All" },
  { key: "door", label: "Door" },
  { key: "key", label: "Keys & slots" },
  { key: "remote", label: "Remote actions" },
  { key: "problem", label: "Problems" },
];

const GROUP_DOT = {
  door: "bg-[var(--k-orange)]",
  key: "bg-[var(--k-accent)]",
  machine: "bg-[#86868b]",
  problem: "bg-[var(--k-red)]",
};

export function MachineLog({ events, loading, showMachine = true, error }) {
  const [filter, setFilter] = useState("all");
  const [machine, setMachine] = useState("");
  const [shown, setShown] = useState(30);

  const sorted = useMemo(() => sortEvents(events), [events]);
  const machineCodes = useMemo(
    () => [...new Set(sorted.map((e) => String(e.machine_id || "").trim()).filter(Boolean))].sort(),
    [sorted]
  );
  const list = sorted.filter((e) => {
    if (machine && String(e.machine_id || "").trim() !== machine) return false;
    if (filter === "all") return true;
    if (filter === "remote") return String(e.detail || "").startsWith("remote by");
    return eventGroup(e.kind) === filter;
  });

  return (
    <section className="k-card-flat">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold">Machine log</h2>
          <p className="text-[13px] k-muted">Door, slots, pickups, returns and remote actions. Newest first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showMachine && machineCodes.length > 1 && (
            <select
              className="k-input !w-auto !py-1.5 !text-[13px]"
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              aria-label="Machine"
            >
              <option value="">All machines</option>
              {machineCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <div role="group" aria-label="Event type" className="inline-flex flex-wrap gap-1">
            {LOG_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-[13px] ${filter === f.key ? "bg-[var(--k-text)] text-white" : "bg-[#f0f0f3] k-muted"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-[var(--k-red)]">{error}</p>}
      {!loading && list.length === 0 && <p className="mt-3 text-[14px] k-muted">No events yet.</p>}
      <ol className="mt-2">
        {list.slice(0, shown).map((e, i) => {
          const t = eventTime(e);
          const remote = String(e.detail || "").startsWith("remote by");
          return (
            <li key={e.id ?? i} className="flex gap-3 border-t border-[var(--k-line)] py-2.5 text-[14px]">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${GROUP_DOT[eventGroup(e.kind)]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{eventLabel(e.kind)}</span>
                  {Number(e.slot) > 0 && <span className="k-muted">slot {e.slot}</span>}
                  {e.room && <span className="k-muted">· room {e.room}</span>}
                  {showMachine && e.machine_id && (
                    <Link href={machineHref(String(e.machine_id).trim())} className="k-link text-[13px]">
                      {String(e.machine_id).trim()}
                    </Link>
                  )}
                  {remote && <span className="k-badge-blue">Remote</span>}
                </div>
                {(e.detail || e.uid) && (
                  <p className="text-[12px] k-faint break-words">
                    {e.detail}
                    {e.uid && !String(e.detail || "").includes(e.uid) ? `${e.detail ? " · " : ""}UID ${e.uid}` : ""}
                  </p>
                )}
              </div>
              <time className="shrink-0 text-[12px] k-faint" dateTime={t?.toISOString()} title={t?.toLocaleString()}>
                {t ? (isToday(t) ? fmtTime(t) : fmtShort(t)) : ""}
              </time>
            </li>
          );
        })}
      </ol>
      {list.length > shown && (
        <button type="button" className="k-btn-ghost mt-2" onClick={() => setShown((n) => n + 50)}>
          Show more ({list.length - shown})
        </button>
      )}
    </section>
  );
}

// ---------- misc ----------

export function RefreshNote({ updatedAt, onRefresh }) {
  return (
    <p className="text-[12px] k-faint">
      Auto-refresh every 15 s{updatedAt ? ` · updated ${fmtTime(updatedAt)}` : ""}
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="k-link ml-2 text-[12px]">
          Refresh now
        </button>
      )}
    </p>
  );
}
