"use client";
import { useEffect, useRef, useState } from "react";

/**
 * "Are you sure?" box for remote machine actions.
 * Shows what will happen and on which machine, with an optional reason
 * that is saved in the machine log. onConfirm(reason) is called on Confirm.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  tone = "primary",
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState("");
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCancel?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const finish = (ok) => {
    const r = reason.trim();
    setReason("");
    if (ok) onConfirm?.(r);
    else onCancel?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4"
      onClick={() => finish(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="k-confirm-title"
        className="w-full max-w-md rounded-[var(--k-radius)] bg-white p-6 shadow-[var(--k-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="k-confirm-title" className="text-[19px] font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-[15px] k-muted">{children}</div>
        <label className="k-label mt-4 block" htmlFor="k-confirm-reason">
          Reason (optional, saved in the machine log)
        </label>
        <input
          id="k-confirm-reason"
          className="k-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && finish(true)}
          placeholder="e.g. Guest called, link not working"
          maxLength={200}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="k-btn-secondary" onClick={() => finish(false)}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={tone === "danger" ? "k-btn-danger" : "k-btn-primary"}
            onClick={() => finish(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
