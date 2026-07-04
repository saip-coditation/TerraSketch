import React from "react";

// AWS only — Azure/GCP are hidden while the product focuses on AWS deploys.
const providers = [
  {
    id: "aws",
    label: "AWS",
    accent: "from-orange-400 to-amber-500",
    initials: "AWS",
  },
];

export default function ProviderSelector({ value, onChange }) {
  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-2 sm:gap-3">
      {providers.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`group relative flex min-h-[5.25rem] flex-col items-start rounded-xl border p-3 text-left transition active:scale-[0.98] sm:min-h-0 sm:p-4 ${
              active
                ? "border-brand-400/60 bg-brand-400/10 shadow-glow"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
            aria-pressed={active}
          >
            <span
              className={`mb-2 grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${p.accent} text-xs font-bold text-white sm:h-9 sm:w-9`}
            >
              {p.initials}
            </span>
            <span className="text-sm font-semibold text-white">{p.label}</span>
            <span className="hidden text-xs text-slate-400 sm:block">
              Generate Terraform for {p.label}
            </span>
            {active && (
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-300 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
