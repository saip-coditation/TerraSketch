import React, { useEffect, useRef, useState } from "react";

const STAGES = [
  {
    id: "analyze",
    label: "Analyzing diagram",
    detail: "Reading shapes, labels, connections and layout",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    durationMs: 4000,
  },
  {
    id: "identify",
    label: "Identifying resources",
    detail: "Mapping icons and labels to cloud resource types",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    durationMs: 6000,
  },
  {
    id: "plan",
    label: "Planning infrastructure",
    detail: "Resolving dependencies, subnets, security groups",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    durationMs: 8000,
  },
  {
    id: "generate",
    label: "Generating Terraform",
    detail: "Writing main.tf, variables.tf, outputs.tf, providers.tf",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    durationMs: 18000,
  },
  {
    id: "validate",
    label: "Validating output",
    detail: "Checking HCL syntax, secret scan, match scoring",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    durationMs: 5000,
  },
];

const TOTAL_MS = STAGES.reduce((s, st) => s + st.durationMs, 0);

function buildMilestones() {
  let acc = 0;
  return STAGES.map((st, i) => {
    const start = acc / TOTAL_MS;
    acc += st.durationMs;
    const end = acc / TOTAL_MS;
    return { ...st, start, end, index: i };
  });
}

const MILESTONES = buildMilestones();

export default function GenerationProgress({ loading }) {
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      if (startRef.current !== null) {
        // snap to done when request finishes
        doneRef.current = true;
        setProgress(100);
        setStageIdx(STAGES.length - 1);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
      return;
    }

    // Reset
    doneRef.current = false;
    startRef.current = performance.now();
    setProgress(0);
    setStageIdx(0);

    const tick = (now) => {
      if (doneRef.current) return;
      const elapsed = now - startRef.current;
      // Slow down near 92% so we don't "complete" before the real request
      const raw = Math.min(elapsed / TOTAL_MS, 1);
      const capped = raw < 0.92 ? raw : 0.92 + (raw - 0.92) * 0.1;
      const pct = Math.round(capped * 100);
      setProgress(pct);

      const frac = capped;
      const idx = MILESTONES.findLastIndex((m) => frac >= m.start);
      setStageIdx(Math.max(0, idx));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loading]);

  if (!loading && progress === 0) return null;

  const stage = STAGES[stageIdx];
  const isDone = !loading && progress === 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isDone ? "Generation complete" : `Generating: ${stage.label}`}
      className="card-glow overflow-hidden p-5 sm:p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isDone ? "bg-emerald-500/20 text-emerald-300" : "bg-brand-500/20 text-brand-300"}`}>
            {isDone ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 11 3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            ) : (
              stage.icon
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {isDone ? "Generation complete" : stage.label}
            </p>
            <p className="text-[11px] text-slate-500">
              {isDone ? "Redirecting to result…" : stage.detail}
            </p>
          </div>
        </div>
        <span className={`font-mono text-sm font-bold tabular-nums ${isDone ? "text-emerald-300" : "text-brand-300"}`}>
          {progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${isDone ? "bg-emerald-400" : "bg-gradient-to-r from-brand-400 to-accent-400"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage pipeline */}
      <div className="flex min-w-0 gap-1">
        {STAGES.map((st, i) => {
          const done = i < stageIdx || isDone;
          const active = i === stageIdx && !isDone;
          return (
            <div
              key={st.id}
              title={st.label}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 transition ${
                active
                  ? "bg-brand-500/15"
                  : done
                    ? "bg-white/[0.04]"
                    : "opacity-30"
              }`}
            >
              <span className={`block h-4 w-4 shrink-0 ${active ? "text-brand-300" : done ? "text-emerald-400" : "text-slate-600"}`}>
                {done && !active ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="m9 11 3 3L22 4" />
                  </svg>
                ) : (
                  st.icon
                )}
              </span>
              <span className={`hidden text-center text-[9px] leading-tight sm:block ${active ? "text-brand-200" : done ? "text-slate-400" : "text-slate-600"}`}>
                {st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
