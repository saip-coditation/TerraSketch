import React, { useState } from "react";
import { Link } from "react-router-dom";
import { RELEASES, CURRENT_VERSION } from "../data/releases.js";

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICONS = {
  dashboard: <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>,
  doc:       <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  scale:     <><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></>,
  mail:      <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  library:   <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  shield:    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  placeholder: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
  warning:   <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  diagram:   <><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><path d="M5 7v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"/><path d="M12 13v4"/></>,
  feedback:  <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  port:      <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
  compliance:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  cost:      <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  tfvars:    <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  diff:      <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  graph:     <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
  generate:  <><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></>,
  providers: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>,
  history:   <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,
  match:     <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
};

function FeatureIcon({ name }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name] || ICONS.doc}
    </svg>
  );
}

// ── Badge chip ────────────────────────────────────────────────────────────────

function Badge({ type }) {
  if (!type) return null;
  if (type === "new")
    return (
      <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-300 ring-1 ring-brand-400/30">
        New
      </span>
    );
  if (type === "beta")
    return (
      <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-400/30">
        Beta
      </span>
    );
  return null;
}

// ── Single release card ───────────────────────────────────────────────────────

function ReleaseCard({ release, isLatest }) {
  const [expanded, setExpanded] = useState(isLatest);

  const d = new Date(release.date);
  const dateStr = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div
      className={`relative rounded-2xl border bg-white/[0.03] transition-all ${
        isLatest ? "border-brand-500/40 shadow-[0_0_40px_rgba(99,102,241,0.08)]" : "border-white/8"
      }`}
    >
      {/* Timeline dot */}
      <div
        className={`absolute -left-[calc(1.5rem+1px)] top-7 h-3 w-3 rounded-full border-2 ${
          isLatest
            ? "border-brand-400 bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]"
            : "border-slate-600 bg-slate-800"
        }`}
      />

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-sm font-bold ${
                  isLatest ? "text-brand-300" : "text-slate-300"
                }`}
              >
                v{release.version}
              </span>
              <Badge type={release.badge} />
              {isLatest && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Current
                </span>
              )}
              <span className="text-xs text-slate-500">{dateStr}</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-white">{release.title}</h2>
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">{release.summary}</p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
          >
            {expanded ? "Collapse" : "Details"}
          </button>
        </div>

        {expanded && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {release.highlights.map((h, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5"
              >
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                  <FeatureIcon name={h.icon} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{h.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{h.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Releases() {
  return (
    <main className="container-page min-w-0 py-6 sm:py-10 md:py-14">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <header className="mb-10">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-300 ring-1 ring-brand-400/20">
              v{CURRENT_VERSION}
            </span>
            <span className="text-xs text-slate-500">Latest</span>
          </div>
          <h1 className="heading-display text-3xl sm:text-4xl">Release Notes</h1>
          <p className="mt-2 text-slate-400 text-sm max-w-xl">
            What's new in TerraSketch — feature updates, improvements, and fixes. Open-source infrastructure generation for AWS, Azure, and GCP.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/generate" className="btn-primary">
              Try the latest
            </Link>
            <Link to="/library" className="btn-secondary">
              Architecture library
            </Link>
          </div>
        </header>

        {/* Current version hero */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-400/25 bg-gradient-to-r from-brand-500/10 to-accent-500/5 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 17 10 7l4 7 6-9" />
            </svg>
          </span>
          <div>
            <p className="text-xs text-brand-300/70 font-medium uppercase tracking-wider">TerraSketch</p>
            <p className="text-sm font-semibold text-white">
              Version {CURRENT_VERSION} — {RELEASES[0].title}
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative border-l border-white/8 pl-8 space-y-6">
          {RELEASES.map((release, i) => (
            <ReleaseCard key={release.version} release={release} isLatest={i === 0} />
          ))}

          {/* Timeline end */}
          <div className="absolute -left-[5px] bottom-0 h-4 w-2.5 rounded-b-full bg-gradient-to-b from-white/10 to-transparent" />
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-slate-600">
          TerraSketch is an internal tool. For feature requests or bugs, submit feedback on any Result page.
        </p>
      </div>
    </main>
  );
}
