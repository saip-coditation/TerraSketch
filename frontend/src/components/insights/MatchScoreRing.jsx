import React from "react";

export default function MatchScoreRing({ percent = 0, label = "Diagram match" }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return (
    <div className="card-glow flex max-w-full flex-col items-center p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="relative mt-4 h-36 w-36">
        <svg className="-rotate-90 transform" viewBox="0 0 120 120" aria-hidden>
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="url(#scoreGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
          <defs>
            <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold text-white">{p}</span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>
      <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-slate-400">
        Heuristic score vs common patterns for your cloud. Use advice below to tighten fidelity.
      </p>
    </div>
  );
}
