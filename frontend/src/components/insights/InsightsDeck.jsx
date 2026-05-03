import React from "react";
import Badge from "../shared/Badge.jsx";

function ListBlock({ title, items, tone = "default" }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-white/5 bg-ink-900/40 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
        <Badge tone={tone}>{items.length}</Badge>
      </h3>
      <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-300 marker:text-brand-400">
        {items.map((t, i) => (
          <li key={i} className="break-words pl-1">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InsightsDeck({
  improvementAdvice = [],
  securityWarnings = [],
  terraformValidation = null,
}) {
  const tv = terraformValidation?.validate;
  const fmt = terraformValidation?.fmt;

  return (
    <div className="space-y-4">
      <ListBlock title="Improvement advice" items={improvementAdvice} tone="network" />
      <ListBlock title="Security checks" items={securityWarnings} tone="security" />

      {(tv || fmt) && (
        <div className="rounded-xl border border-white/5 bg-ink-900/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Terraform CLI
          </h3>
          {tv?.skipped ? (
            <p className="mt-2 text-sm text-slate-400">
              Validate skipped: {tv.reason}
            </p>
          ) : tv ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className={tv.valid ? "text-emerald-300" : "text-rose-300"}>
                {tv.valid ? "terraform validate — passed" : "terraform validate — issues"}
              </p>
              {(tv.stderr || tv.stdout) && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-slate-400">
                  {(tv.stderr || tv.stdout || "").slice(-3500)}
                </pre>
              )}
            </div>
          ) : null}

          {fmt && !fmt.skipped && (
            <p
              className={`mt-3 text-sm ${fmt.formatted_ok ? "text-emerald-300/90" : "text-amber-200/90"}`}
            >
              {fmt.formatted_ok
                ? "terraform fmt -check — formatting OK"
                : "terraform fmt — files may need formatting"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
