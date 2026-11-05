"use client";
import { useEffect, useState } from "react";

const OPTIONS = [
  { key: "machines", label: "Machines" },
  { key: "table", label: "Table" },
];

/** Machines / Table toggle. */
export default function ViewSwitch({ view, onChange, label = "View" }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-[#e8e8ed] p-1">
      {OPTIONS.map((o) => (
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

/** The chosen view, remembered in this browser. */
export function useSavedView(storageKey) {
  const [view, setView] = useState("machines");
  useEffect(() => {
    (async () => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved === "machines" || saved === "table") setView(saved);
      } catch {
        /* storage unavailable: keep the default view */
      }
    })();
  }, [storageKey]);
  const change = (v) => {
    setView(v);
    try {
      window.localStorage.setItem(storageKey, v);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  };
  return [view, change];
}
