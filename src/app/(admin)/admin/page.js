"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useKeymaticData } from "@/utils/useKeymaticData";
import { buildAlerts, buildKeyStatus, buildMachineCards, buildUpcoming, findMachineForKey } from "@/lib/machineView";
import {
  AlertsStrip,
  KeyStatusTable,
  MachineCard,
  MachineLog,
  MachinesTable,
  RefreshNote,
  UpcomingList,
} from "@/components/machines/MachineParts";
import ViewSwitch, { useSavedView } from "@/components/machines/ViewSwitch";

function Stat({ label, value, total, note, tone }) {
  return (
    <div className="k-card-flat !p-5">
      <p className="text-[13px] k-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        {value}
        {total !== undefined && <span className="text-lg font-normal k-faint"> / {total}</span>}
      </p>
      {note && (
        <p
          className={`mt-1 text-[13px] ${tone === "warn" ? "text-[var(--k-orange)]" : tone === "bad" ? "text-[var(--k-red)]" : "k-muted"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { keys, machines, users, clients, slots, events, errors, loading, updatedAt, reload } = useKeymaticData();
  const [view, changeView] = useSavedView("keymatic.overview.view");
  // "now" moves with each auto-refresh.
  const [openedAt] = useState(() => new Date());
  const now = updatedAt || openedAt;

  const cards = useMemo(() => buildMachineCards({ machines, slots, keys, now }), [machines, slots, keys, now]);
  const keyStatus = useMemo(
    () => buildKeyStatus({ keys, slots, clients, machines, now }),
    [keys, slots, clients, machines, now]
  );
  const upcoming = useMemo(() => buildUpcoming({ keyStatus, keys, clients, now }), [keyStatus, keys, clients, now]);
  const relink = useMemo(
    () => keys.filter((k) => k.machine_id && !findMachineForKey(k, machines)).length,
    [keys, machines]
  );
  const alerts = useMemo(() => {
    const list = buildAlerts({ cards, keyStatus });
    if (relink) {
      list.push({
        tone: "orange",
        text: `${relink} ${relink === 1 ? "key is" : "keys are"} linked to a machine that no longer exists.`,
        href: "/link-owner",
      });
    }
    return list;
  }, [cards, keyStatus, relink]);

  const today = now.toDateString();
  const count = (state) => keyStatus.filter((r) => r.state === state).length;
  const stats = {
    online: cards.filter((m) => m.online).length,
    offline: cards.filter((m) => m.online === false).length,
    keysIn: count("in") + count("waiting"),
    withGuest: count("guest"),
    overdue: count("overdue"),
    pickups: upcoming.filter((e) => e.type === "pickup" && e.at.toDateString() === today).length,
    returns: upcoming.filter((e) => e.type === "return" && e.at.toDateString() === today).length,
    free: cards.reduce((n, m) => n + m.freeSlots, 0),
    canLink: cards.reduce((n, m) => n + m.freeToLink, 0),
  };
  const dash = (v) => (loading ? "…" : v);

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
          <RefreshNote updatedAt={updatedAt} onRefresh={reload} />
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

      {!loading && <AlertsStrip alerts={alerts} />}

      <section aria-label="Key numbers" className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 k-fade-in-2">
        <Stat
          label="Machines online"
          value={dash(stats.online)}
          total={loading ? undefined : cards.length}
          note={loading ? null : stats.offline ? `${stats.offline} offline` : "All reporting"}
          tone={stats.offline ? "bad" : undefined}
        />
        <Stat
          label="Keys in machines"
          value={dash(stats.keysIn)}
          total={loading ? undefined : keys.length}
          note={loading ? null : `${stats.withGuest} with guests`}
        />
        <Stat
          label="Today"
          value={dash(stats.pickups + stats.returns)}
          note={loading ? null : `${stats.pickups} pickups · ${stats.returns} returns`}
        />
        <Stat
          label="Not returned"
          value={dash(stats.overdue)}
          note={loading ? null : `${stats.free} empty slots · ${stats.canLink} can link`}
          tone={stats.overdue ? "bad" : undefined}
        />
      </section>

      <div className="mt-6">
        {view === "machines" ? (
          <section aria-label="Machines" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading
              ? [0, 1, 2].map((i) => <div key={i} className="k-card-flat h-72 animate-pulse" />)
              : cards.map((m) => <MachineCard key={m.id} m={m} />)}
            {!loading && cards.length === 0 && <p className="k-muted">No machines yet.</p>}
          </section>
        ) : (
          <MachinesTable cards={cards} loading={loading} />
        )}
      </div>

      <div id="keys" className="mt-6 scroll-mt-20">
        <KeyStatusTable
          rows={keyStatus}
          loading={loading}
          users={users}
          title="Key status"
          subtitle="Where every key is and who has it. Not returned first."
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 items-start">
        <UpcomingList items={upcoming} loading={loading} />
        <MachineLog events={events} loading={loading} />
      </div>
    </div>
  );
}
