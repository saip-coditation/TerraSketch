import React, { useState } from "react";

export default function AssumptionsBox({ assumptions = [], usageInstructions }) {
  const [open, setOpen] = useState(true);
  const hasAssumptions = assumptions && assumptions.length > 0;
  const hasUsage = !!usageInstructions;

  if (!hasAssumptions && !hasUsage) return null;

  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-amber-300"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm font-semibold text-amber-100">
            AI assumptions &amp; usage
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className={`text-amber-100 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="space-y-3 border-t border-amber-300/10 px-4 py-3 text-sm text-amber-100/90">
          {hasAssumptions && (
            <ul className="list-inside list-disc space-y-1.5">
              {assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {hasUsage && (
            <p className="rounded-lg border border-white/5 bg-white/5 p-3 text-slate-200">
              <span className="mr-1 font-semibold text-white">How to use:</span>
              {usageInstructions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
