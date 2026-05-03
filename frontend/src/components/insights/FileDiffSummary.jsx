import React from "react";

export default function FileDiffSummary({ summary }) {
  if (!summary || typeof summary !== "object" || Object.keys(summary).length === 0) {
    return null;
  }

  const rows = Object.entries(summary);

  return (
    <div className="card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Changes vs previous generation
      </h3>
      <ul className="mt-3 space-y-2">
        {rows.map(([path, meta]) => (
          <li
            key={path}
            className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/5 bg-ink-900/50 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
          >
            <span className="min-w-0 max-w-full break-all font-mono text-xs text-brand-200">{path}</span>
            <span className="shrink-0 text-xs text-slate-400">
              {meta.status === "added" && "new file"}
              {meta.status === "removed" && "removed"}
              {meta.status === "changed" &&
                `${meta.lines_before ?? 0} → ${meta.lines_after ?? 0} lines`}
              {typeof meta.delta_lines === "number" && meta.status === "changed" && (
                <span
                  className={
                    meta.delta_lines > 0 ? " text-emerald-300/90" : " text-amber-200/90"
                  }
                >
                  {` (${meta.delta_lines > 0 ? "+" : ""}${meta.delta_lines})`}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
