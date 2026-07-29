import React from "react";
import Badge from "../shared/Badge.jsx";

const SEVERITY = {
  error: {
    label: "Errors",
    tone: "security",
    dot: "bg-rose-400",
    text: "text-rose-300",
    badge: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  },
  warning: {
    label: "Warnings",
    tone: "default",
    dot: "bg-amber-400",
    text: "text-amber-200",
    badge: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  },
  info: {
    label: "Suggestions",
    tone: "network",
    dot: "bg-sky-400",
    text: "text-sky-200",
    badge: "border-sky-400/40 bg-sky-400/10 text-sky-100",
  },
};

const ORDER = ["error", "warning", "info"];

/**
 * Static-lint findings on the generated HCL. These come from a pure-Python
 * analysis that always runs (no terraform CLI needed), so the panel renders
 * even on hosts where `terraform validate` is skipped.
 */
export default function LintPanel({ findings = [] }) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) {
    if (counts[f.severity] != null) counts[f.severity] += 1;
  }
  const total = findings.length;

  return (
    <div className="rounded-xl border border-white/5 bg-ink-900/40 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Static lint
        {total === 0 ? (
          <Badge tone="network">clean</Badge>
        ) : (
          <Badge tone={counts.error ? "security" : "default"}>{total}</Badge>
        )}
      </h3>

      {total === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          No structural issues found — balanced blocks, no undeclared variables,
          no duplicate resources.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEVERITY[s].badge}`}
              >
                {counts[s]} {SEVERITY[s].label.toLowerCase()}
              </span>
            ))}
          </div>

          <ul className="mt-3 space-y-2 text-sm">
            {ORDER.flatMap((s) =>
              findings
                .filter((f) => f.severity === s)
                .map((f, i) => (
                  <li
                    key={`${s}-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY[s].dot}`}
                    />
                    <span className="min-w-0 flex-1 break-words leading-relaxed text-slate-300">
                      {f.message}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {f.file}
                    </span>
                  </li>
                ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
