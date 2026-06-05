import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ARCHITECTURES, CATEGORIES, PROVIDERS } from "../data/architectures.js";

const PROVIDER_LABELS = { aws: "AWS", azure: "Azure", gcp: "Google Cloud" };
const PROVIDER_COLORS = {
  aws: "from-orange-500/20 to-amber-500/10 border-orange-500/20",
  azure: "from-blue-500/20 to-indigo-500/10 border-blue-500/20",
  gcp: "from-green-500/20 to-teal-500/10 border-green-500/20",
};
const PROVIDER_BADGE = {
  aws: "bg-orange-500/15 text-orange-300 border-orange-500/25",
  azure: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  gcp: "bg-green-500/15 text-green-300 border-green-500/25",
};
const COMPLEXITY_BADGE = {
  low: "bg-emerald-500/15 text-emerald-300",
  medium: "bg-amber-500/15 text-amber-300",
  high: "bg-rose-500/15 text-rose-300",
};

const PROVIDER_ICONS = {
  aws: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5" aria-hidden>
      <polygon strokeLinecap="round" strokeLinejoin="round" points="12,2 22,20 2,20" />
    </svg>
  ),
  gcp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  ),
};

function ArchitectureCard({ arch, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(arch)}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 ${PROVIDER_COLORS[arch.provider]}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${PROVIDER_BADGE[arch.provider]}`}>
            {PROVIDER_LABELS[arch.provider]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COMPLEXITY_BADGE[arch.complexity]}`}>
            {arch.complexity}
          </span>
        </div>
        <span className="shrink-0 rounded-lg bg-white/5 px-2 py-0.5 text-xs text-slate-400">
          {arch.category}
        </span>
      </div>

      <h3 className="mb-1.5 font-semibold text-white group-hover:text-brand-300 transition-colors">
        {arch.name}
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-400 line-clamp-2">
        {arch.description}
      </p>

      <div className="flex flex-wrap gap-1">
        {arch.services.slice(0, 4).map((s) => (
          <span key={s} className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-slate-400">
            {s}
          </span>
        ))}
        {arch.services.length > 4 && (
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-slate-500">
            +{arch.services.length - 4}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Verified · {arch.sourceOrg}
      </div>
    </button>
  );
}

function DetailPanel({ arch, onClose, onGenerate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-ink-900 shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-br p-6 ${PROVIDER_COLORS[arch.provider]}`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[arch.provider]}`}>
              {PROVIDER_ICONS[arch.provider]}
              {PROVIDER_LABELS[arch.provider]}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COMPLEXITY_BADGE[arch.complexity]}`}>
              {arch.complexity} complexity
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-300">
              {arch.category}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">{arch.name}</h2>
          <p className="mt-1 text-sm text-slate-300">{arch.description}</p>
        </div>

        <div className="space-y-5 p-6">
          {/* Services */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Services Used</h3>
            <div className="flex flex-wrap gap-1.5">
              {arch.services.map((s) => (
                <span key={s} className="rounded-lg bg-white/5 px-2.5 py-1 text-sm text-slate-300">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Source */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Source</h3>
            <p className="text-sm font-medium text-white">{arch.sourceOrg}</p>
            <p className="text-xs text-slate-400">{arch.sourceType}</p>
            <a
              href={arch.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300"
            >
              View original article
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          </div>

          {/* Warning */}
          <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-400" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-200">
              Generated Terraform is a <strong>starter template (~60–70% complete)</strong>. It contains placeholders for organization-specific values. Review all TODOs and replace placeholders before deploying.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onGenerate(arch)}
              className="btn-primary flex-1 justify-center py-3"
            >
              Generate Terraform
            </button>
            <a
              href={arch.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex-1 justify-center py-3 text-center"
            >
              View Original Source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = ARCHITECTURES.filter((a) => {
    const matchesProvider = providerFilter === "all" || a.provider === providerFilter;
    const matchesCategory = categoryFilter === "all" || a.category === categoryFilter;
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    return matchesProvider && matchesCategory && matchesSearch;
  });

  const handleGenerate = (arch) => {
    navigate("/generate", {
      state: {
        prefill: {
          text: arch.textDescription,
          provider: arch.provider,
          environment: "production",
          inputType: "text",
        },
      },
    });
  };

  return (
    <main className="container-page min-w-0 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Verified architectures only
        </div>
        <h1 className="heading-display text-2xl text-white sm:text-3xl">Architecture Library</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Browse proven cloud architectures from AWS, Azure, and GCP official sources. Select one to generate a Terraform starter project.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search by name or service..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
        <div className="flex gap-2">
          <select
            className="input"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">All Providers</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Count */}
      <p className="mb-4 text-xs text-slate-500">
        {filtered.length} architecture{filtered.length !== 1 ? "s" : ""} found
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-500">No architectures match your filters.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((arch) => (
            <ArchitectureCard key={arch.id} arch={arch} onSelect={setSelected} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailPanel
          arch={selected}
          onClose={() => setSelected(null)}
          onGenerate={(arch) => {
            setSelected(null);
            handleGenerate(arch);
          }}
        />
      )}
    </main>
  );
}
