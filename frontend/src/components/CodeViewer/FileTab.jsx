import React from "react";

export default function FileTab({ name, active, onClick, lines }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={`group flex shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition sm:py-1.5 ${
        active
          ? "bg-white/10 text-white"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={active ? "text-brand-300" : "text-slate-500"}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="font-mono text-[13px]">{name}</span>
      {typeof lines === "number" && (
        <span className="ml-1 text-[11px] text-slate-500">{lines}L</span>
      )}
    </button>
  );
}
