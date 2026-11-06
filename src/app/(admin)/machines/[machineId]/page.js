"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { runMachineCommand, useKeymaticData } from "@/utils/useKeymaticData";
import { buildAlerts, buildKeyStatus, buildMachineCards, buildUpcoming, guestName, norm } from "@/lib/machineView";
import ConfirmDialog from "@/components/machines/ConfirmDialog";
import {
  KeyStatusTable,
  MachineLog,
  RefreshNote,
  SlotGrid,
  StatusBadges,
  UpcomingList,
} from "@/components/machines/MachineParts";

const ACTION_TEXT = {
  open_door: { title: "Open the door?", confirm: "Open door", sending: "Opening the door…" },
  unlock_slot: { title: "Unlock this slot?", confirm: "Unlock slot", sending: "Unlocking the slot…" },
  sync: { title: "Sync keys to the machine?", confirm: "Sync keys", sending: "Sending the key list…" },
  slot_status: { sending: "Reading the slot sensor…" },
};

export default function MachinePage() {
  const params = useParams();
  const code = decodeURIComponent(String(params?.machineId || "")).trim();
  const { keys, machines, users, clients, slots, events, errors, loading, updatedAt, reload } = useKeymaticData({
    machine: code,
  });
  const [openedAt] = useState(() => new Date());
  const now = updatedAt || openedAt;

  const [confirm, setConfirm] = useState(null); // { action, slot }
  const [slotOpen, setSlotOpen] = useState(null); // slot number shown in the slot panel
  const [feedback, setFeedback] = useState(null); // { state: sending|ok|fail, text }
  const [busy, setBusy] = useState(false);
  const [runningSlot, setRunningSlot] = useState(null);
  const [forceControls, setForceControls] = useState(false);

  // Back from the Keys page after saving a key for this machine.
  useEffect(() => {
    (async () => {
      if (new URLSearchParams(window.location.search).get("saved") !== "1") return;
      setFeedback({ state: "ok", text: "Key saved. Press Sync keys so the machine learns it." });
      window.history.replaceState(null, "", window.location.pathname);
    })();
  }, []);

  const allCards = useMemo(() => buildMachineCards({ machines, slots, keys, now }), [machines, slots, keys, now]);
  const m = allCards.find((c) => norm(c.code) === norm(code)) || null;
  const keyStatus = useMemo(
    () => buildKeyStatus({ keys, slots, clients, machines, now }),
    [keys, slots, clients, machines, now]
  );
  const myKeys = useMemo(
    () => keyStatus.filter((r) => norm(r.machineCode) === norm(code) || norm(r.slotMachine) === norm(code)),
    [keyStatus, code]
  );
  const myKeyIds = useMemo(() => new Set(myKeys.map((r) => r.id)), [myKeys]);
  const upcoming = useMemo(
    () => buildUpcoming({ keyStatus: myKeys, keys: keys.filter((k) => myKeyIds.has(k.id)), clients, now }),
    [myKeys, myKeyIds, keys, clients, now]
  );
  const alerts = useMemo(() => (m ? buildAlerts({ cards: [m], keyStatus: myKeys }) : []), [m, myKeys]);
  const statusByKeyId = useMemo(() => new Map(myKeys.map((r) => [r.id, r])), [myKeys]);

  const offline = m?.online === false && !forceControls;
  const slot = m && slotOpen ? m.slots.find((s) => s.n === slotOpen) : null;

  const run = async (action, slotNo, reason) => {
    setBusy(true);
    setRunningSlot(slotNo || null);
    setFeedback({ state: "sending", text: ACTION_TEXT[action].sending + (slotNo ? ` (slot ${slotNo})` : "") });
    const res = await runMachineCommand(m.code, action, { slot: slotNo, reason });
    setFeedback({ state: res.ok ? "ok" : "fail", text: res.message || (res.ok ? "Done" : "Failed") });
    setBusy(false);
    setRunningSlot(null);
    reload();
  };
  const ask = (action, slotNo) => setConfirm({ action, slot: slotNo });

  if (!loading && !m) {
    return (
      <div className="k-page">
        <Link href="/admin" className="k-link text-[14px]">
          ← Overview
        </Link>
        <h1 className="k-title mt-4">Machine {code} not found</h1>
        <p className="k-subtitle">It may have been renamed or deleted.</p>
      </div>
    );
  }

  const unregSlots = m ? m.slots.filter((s) => s.unreg) : [];

  return (
    <div className="k-page">
      <Link href="/admin" className="k-link text-[14px]">
        ← Overview
      </Link>

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

      {/* Machine + remote control + slots, in one card */}
      <section aria-label="Machine" className="mt-4 k-card !p-7 k-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg bg-[var(--k-accent-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--k-accent)]">
                {m?.code || code}
              </span>
              {m?.timezone && <span className="text-[13px] k-muted">{m.timezone}</span>}
            </div>
            <h1 className="text-[34px] leading-tight font-semibold" style={{ letterSpacing: "-0.02em" }}>
              {m?.name || "…"}
            </h1>
            {m?.place && (
              <p className="text-[15px] k-muted">
                {m.place}
                {m.mapLink && (
                  <a href={m.mapLink} target="_blank" rel="noopener noreferrer" className="k-link ml-2">
                    Map ↗
                  </a>
                )}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              {m && <StatusBadges m={m} />}
              <RefreshNote updatedAt={updatedAt} onRefresh={reload} />
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className="k-btn-primary"
                disabled={!m || busy || offline}
                onClick={() => ask("open_door")}
              >
                Open door
              </button>
              <button
                type="button"
                className="k-btn-secondary"
                disabled={!m || busy || offline}
                onClick={() => ask("sync")}
              >
                Sync keys
              </button>
              <Link href={`/create-key?machine=${encodeURIComponent(m?.code || code)}`} className="k-btn-secondary">
                + Add key
              </Link>
            </div>
            <p className="text-[12px] k-muted">Each action asks first and is saved in the log.</p>
          </div>
        </div>

        {m?.online === false && (
          <p className="mt-4 rounded-lg bg-[var(--k-red-soft)] px-3 py-2 text-[13px] text-[var(--k-red)]">
            This machine is offline{m.lastSeen ? ` (last seen ${m.lastSeen.toLocaleString()})` : ""}, so commands will
            probably fail.{" "}
            {!forceControls && (
              <button type="button" className="underline font-medium" onClick={() => setForceControls(true)}>
                Try anyway
              </button>
            )}
          </p>
        )}
        {m && !m.hasCloudUrl && (
          <p className="mt-4 text-[13px] text-[var(--k-orange)]">
            No Pi address is saved for this machine.{" "}
            <Link href="/create-machine" className="underline">
              Add it on the Machines page
            </Link>{" "}
            (unless it is set on the server).
          </p>
        )}
        {feedback && (
          <div
            role="status"
            className={`mt-4 flex items-start gap-3 rounded-lg px-3 py-2 text-[14px] ${
              feedback.state === "sending"
                ? "bg-[var(--k-accent-soft)] text-[var(--k-accent)]"
                : feedback.state === "ok"
                  ? "bg-[var(--k-green-soft)] text-[var(--k-green)]"
                  : "bg-[var(--k-red-soft)] text-[var(--k-red)]"
            }`}
          >
            <span aria-hidden="true">{feedback.state === "sending" ? "⏳" : feedback.state === "ok" ? "✓" : "✗"}</span>
            <span className="flex-1">{feedback.text}</span>
            {feedback.state !== "sending" && (
              <button
                type="button"
                aria-label="Dismiss"
                className="opacity-70 hover:opacity-100"
                onClick={() => setFeedback(null)}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Slots */}
        <div className="mt-6 border-t border-[var(--k-line)] pt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[21px] font-semibold">Slots</h2>
            <p className="text-[14px] k-muted">Tap a slot to unlock it or register a key.</p>
          </div>
          {m && (
            <div className="flex gap-7">
              <SlotStat
                value={m.unregIn}
                label={m.unregIn === 1 ? "Unknown key" : "Unknown keys"}
                warn={m.unregIn > 0}
              />
              <SlotStat value={m.inCount} total={m.capacity} label="Slots used" />
              <SlotStat value={m.freeSlots} label="Empty" />
            </div>
          )}
        </div>
        <div className="mt-6 mx-auto max-w-[660px]">
          {m ? (
            <SlotGrid m={m} large onSlotClick={(s) => setSlotOpen(s.n)} busySlot={runningSlot} />
          ) : (
            <div className="h-48 animate-pulse" />
          )}
        </div>
        {m && (
          <p className="mt-5 flex flex-wrap justify-center gap-5 text-[13px] k-muted">
            <SlotLegend cls="bg-[var(--k-accent)]">Key inside</SlotLegend>
            <SlotLegend cls="bg-[var(--k-orange-soft)] border-2 border-dashed border-[var(--k-orange)]">
              Unknown key
            </SlotLegend>
            <SlotLegend cls="bg-[#fafafa] border border-[#c7c7cc]">Empty</SlotLegend>
          </p>
        )}
        {m?.outside.length > 0 && (
          <p className="mt-4 rounded-lg bg-[var(--k-orange-soft)] px-3 py-2 text-[13px] text-[var(--k-orange)]">
            {m.outside.map((s) => `Room ${s.room} is reported in slot ${s.n}`).join(" · ")}, but this machine has{" "}
            {m.capacity} slots. Check the machine setup.
          </p>
        )}
      </section>

      {/* Needs attention, with a button to fix it */}
      {!loading && alerts.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {alerts.map((a, i) => {
            const unreg = /unregistered/i.test(a.short || "");
            return (
              <li
                key={i}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-[18px] py-3 text-[14px] ${
                  a.tone === "red"
                    ? "bg-[var(--k-red-soft)] text-[var(--k-red)]"
                    : "bg-[var(--k-orange-soft)] text-[#8a3f00]"
                }`}
              >
                <span>
                  {unreg && unregSlots.length > 0 ? (
                    <>
                      <b>
                        Slot{unregSlots.length > 1 ? "s" : ""} {unregSlots.map((s) => s.n).join(", ")}
                      </b>{" "}
                      {unregSlots.length > 1 ? "have keys that are" : "has a key that is"} not registered.
                    </>
                  ) : (
                    a.short || a.text
                  )}
                </span>
                {a.sync && (
                  <button
                    type="button"
                    className="rounded-full bg-white px-4 py-2.5 text-[14px] font-medium min-h-[44px]"
                    disabled={busy || offline}
                    onClick={() => ask("sync")}
                  >
                    Sync keys
                  </button>
                )}
                {unreg && unregSlots.length > 0 && (
                  <button
                    type="button"
                    className="rounded-full bg-white px-4 py-2.5 text-[14px] font-medium min-h-[44px]"
                    onClick={() => setSlotOpen(unregSlots[0].n)}
                  >
                    Register it
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5">
        <UpcomingList items={upcoming} loading={loading} showMachine={false} />
      </div>

      <div id="keys" className="mt-5 scroll-mt-20">
        <KeyStatusTable
          rows={myKeys}
          loading={loading}
          users={users}
          showMachine={false}
          title="Keys"
          subtitle="Keys linked to this machine, plus any key sitting in its slots."
        />
      </div>

      <div className="mt-5">
        <MachineLog events={events} loading={loading} showMachine={false} />
      </div>

      {/* Slot panel */}
      {slot && !confirm && (
        <SlotPanel
          m={m}
          s={slot}
          status={statusByKeyId.get(slot.keyId)}
          disabled={busy || offline}
          onClose={() => setSlotOpen(null)}
          onUnlock={() => ask("unlock_slot", slot.n)}
          onSync={() => ask("sync")}
          onCheck={() => {
            setSlotOpen(null);
            run("slot_status", slot.n);
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? ACTION_TEXT[confirm.action].title : ""}
        confirmLabel={confirm ? ACTION_TEXT[confirm.action].confirm : ""}
        tone={confirm?.action === "sync" ? "primary" : "danger"}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => {
          const c = confirm;
          setConfirm(null);
          setSlotOpen(null);
          run(c.action, c.slot, reason);
        }}
      >
        {confirm?.action === "open_door" && (
          <p>
            The door of <b>{m?.name}</b> ({m?.code}) will unlock now. Make sure someone is at the machine.
          </p>
        )}
        {confirm?.action === "unlock_slot" && (
          <p>
            Slot <b>{confirm.slot}</b> on <b>{m?.name}</b> ({m?.code}) will release its key
            {(() => {
              const s = m?.slots.find((x) => x.n === confirm.slot);
              return s?.room
                ? ` (room ${s.room})`
                : s?.unreg
                  ? " (unregistered key)"
                  : s?.uid
                    ? ""
                    : " (the slot looks empty)";
            })()}
            . The door must be open to take it.
          </p>
        )}
        {confirm?.action === "sync" && (
          <p>
            Send the current list of registered keys to <b>{m?.name}</b> ({m?.code}). Use this after adding or editing
            keys.
          </p>
        )}
        {offline === false && m?.online === false && (
          <p className="mt-2 text-[var(--k-red)]">The machine looks offline.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Details and actions for one slot. */
function SlotPanel({ m, s, status, disabled, onClose, onUnlock, onCheck, onSync }) {
  const registerHref = `/create-key?machine=${encodeURIComponent(m.code)}&uid=${encodeURIComponent(s.uid)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="k-slot-title"
        className="w-full max-w-md rounded-[var(--k-radius)] bg-white p-6 shadow-[var(--k-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] k-faint">
              {m.name} · {m.code}
            </p>
            <h2 id="k-slot-title" className="text-[21px] font-semibold">
              Slot {s.n}
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="k-btn-ghost !px-3">
            ✕
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-[14px]">
          <dt className="k-faint">Contents</dt>
          <dd>
            {s.unreg ? (
              <span className="k-badge-orange">Unregistered key</span>
            ) : s.key ? (
              <>
                {s.room ? `Room ${s.room}` : s.keyLabel}
                {s.foreign && <span className="ml-2 k-badge-orange">Linked to another machine</span>}
              </>
            ) : s.uid ? (
              "Unknown key"
            ) : (
              <span className="k-faint">Empty</span>
            )}
          </dd>
          {s.uid && (
            <>
              <dt className="k-faint">UID</dt>
              <dd>
                <code className="text-[13px]">{s.uid}</code>
              </dd>
            </>
          )}
          {status && (
            <>
              <dt className="k-faint">Status</dt>
              <dd>
                <span className={status.badge}>{status.label}</span>
                <div className="text-[12px] k-faint mt-1">{status.detail}</div>
              </dd>
            </>
          )}
          {status?.next && (
            <>
              <dt className="k-faint">Next guest</dt>
              <dd>
                {guestName(status.next)} · {status.next._in.toLocaleString()}
              </dd>
            </>
          )}
        </dl>

        {s.notSynced && (
          <div className="mt-4 rounded-lg bg-[var(--k-accent-soft)] px-3 py-2 text-[13px] text-[var(--k-accent)]">
            This key is registered, but the machine still has the old key list. Press <b>Sync keys</b> so the machine
            knows it.
          </div>
        )}

        {s.unreg && (
          <div className="mt-4 rounded-lg bg-[var(--k-orange-soft)] px-3 py-2 text-[13px] text-[var(--k-orange)]">
            The machine doesn’t know this key. Register it to link it to {m.code}; then press <b>Sync keys</b>.
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {s.unreg && (
            <Link href={registerHref} className="k-btn-primary">
              Register this key
            </Link>
          )}
          {s.notSynced && (
            <button type="button" className="k-btn-primary" disabled={disabled} onClick={onSync}>
              Sync keys
            </button>
          )}
          {s.key && (
            <Link href={`/create-key?edit=${encodeURIComponent(s.keyId)}`} className="k-btn-secondary">
              Edit key
            </Link>
          )}
          <button type="button" className="k-btn-secondary" disabled={disabled} onClick={onCheck}>
            Check sensor
          </button>
          <button type="button" className="k-btn-danger" disabled={disabled} onClick={onUnlock}>
            Unlock slot
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotStat({ value, total, label, warn = false }) {
  return (
    <div>
      <p className={`text-[26px] font-semibold leading-tight ${warn ? "text-[var(--k-orange)]" : ""}`}>
        {value}
        {total != null && <span className="text-[17px] font-normal k-faint">/{total}</span>}
      </p>
      <p className="text-[13px] k-muted">{label}</p>
    </div>
  );
}

function SlotLegend({ cls, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded box-border ${cls}`} aria-hidden="true" />
      {children}
    </span>
  );
}
