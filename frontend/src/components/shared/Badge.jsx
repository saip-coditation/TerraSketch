import React from "react";

const tones = {
  default: "border-white/10 bg-white/5 text-slate-200",
  compute: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  storage: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  network: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  database: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200",
  security: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  serverless: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  messaging: "border-orange-400/30 bg-orange-400/10 text-orange-200",
};

export default function Badge({ children, tone = "default", className = "" }) {
  const cls = `inline-flex max-w-full items-center gap-1.5 whitespace-normal break-words rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone] || tones.default} ${className}`.trim();
  return <span className={cls}>{children}</span>;
}
