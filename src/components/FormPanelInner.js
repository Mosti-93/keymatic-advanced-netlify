"use client";
import { useEffect, useState } from "react";

export default function FormPanelInner({ title, addLabel, forceOpen, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const isOpen = open || forceOpen;
  return (
    <div className="k-card !p-0 overflow-visible">
      <button
        type="button"
        onClick={() => !forceOpen && setOpen((o) => !o)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 px-6 sm:px-8 py-5 text-left"
      >
        <span className="text-xl font-semibold tracking-tight">{title}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[14px] font-medium transition ${isOpen ? "bg-[#e8e8ed] text-[#1d1d1f]" : "bg-[#0071e3] text-white"}`}>
          {isOpen ? (forceOpen ? "Editing" : "Close") : <>＋ {addLabel}</>}
        </span>
      </button>
      {isOpen && <div className="px-6 sm:px-8 pb-7 k-fade-in">{children}</div>}
    </div>
  );
}
