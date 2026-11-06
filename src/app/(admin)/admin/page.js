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
  const alerts = useMemo(() => buildAlerts({ cards, keyStatus }), [cards, keyStatus]);
  // Each machine's problems go inside its own card; only problems with no machine stay on top.
  const alertsByMachine = useMemo(() => {
    const map = new Map();
    for (const a of alerts) if (a.machine) map.set(a.machine, [...(map.get(a.machine) || []), a]);
    return map;
  }, [alerts]);
  const generalAlerts = useMemo(() => {
    const list = alerts.filter((a) => !a.machine);
    if (relink) {
      list.push({
        tone: "orange",
        text: `${relink} ${relink === 1 ? "key is" : "keys are"} linked to a machine that no longer exists.`,
        href: "/link-owner",
      });
    }
    return list;
  }, [alerts, relink]);

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

      {!loading && <AlertsStrip alerts={generalAlerts} />}

      <div className="mt-6">
        {view === "machines" ? (
          <section aria-label="Machines" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading
              ? [0, 1, 2].map((i) => <div key={i} className="k-card-flat h-72 animate-pulse" />)
              : cards.map((m) => <MachineCard key={m.id} m={m} alerts={alertsByMachine.get(m.code)} />)}
            {!loading && cards.length === 0 && <p className="k-muted">No machines yet.</p>}
          </section>
        ) : (
          <MachinesTable cards={cards} loading={loading} alertsByMachine={alertsByMachine} />
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
