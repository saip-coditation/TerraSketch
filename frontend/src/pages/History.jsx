import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getHistory } from "../services/api.js";
import { getSessionId } from "../utils/sessionId.js";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import Badge from "../components/shared/Badge.jsx";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

const PROVIDER_LABEL = { aws: "AWS", azure: "Azure", gcp: "GCP" };

const PROVIDER_GRADIENT = {
  aws: "from-amber-500/80 to-orange-600/80",
  azure: "from-sky-500/80 to-blue-600/80",
  gcp: "from-emerald-500/80 to-teal-600/80",
};

export default function History() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const loading = !ready || fetching;

  // Compare mode: pick exactly two generations to diff.
  const [selected, setSelected] = useState([]); // generation_ids, max 2 (oldest drops)
  const toggleSelect = (genId) => {
    setSelected((prev) => {
      if (prev.includes(genId)) return prev.filter((x) => x !== genId);
      return [...prev, genId].slice(-2);
    });
  };
  const compareSelected = () => {
    if (selected.length === 2) {
      navigate(`/compare?a=${selected[0]}&b=${selected[1]}`);
    }
  };

  useEffect(() => {
    if (!ready) return;
    let cancel = false;
    (async () => {
      setFetching(true);
      setError(null);
      try {
        const data = user ? await getHistory(undefined, 10) : await getHistory(getSessionId(), 10);
        if (!cancel) setItems(data);
      } catch (err) {
        if (!cancel) setError(err.message || "Failed to load history");
      } finally {
        if (!cancel) setFetching(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [ready, user]);

  return (
    <main className="container-page min-w-0 py-10 sm:py-14">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {user
              ? "Your last 10 generations on this account."
              : "Your last 10 generations on this device (sign in to sync by email)."}
          </p>
        </div>
        <Link to="/generate" data-tour="history-new" className="btn-primary w-full justify-center py-3.5 sm:w-auto sm:py-2">
          New generation
        </Link>
      </header>

      {items.length > 1 && (
        <p className="mb-4 text-xs text-slate-500">
          Tip: use the ✓ on two cards to compare their Terraform side by side.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-300">
          <LoadingSpinner size={20} /> Loading history…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          <p className="text-base font-medium text-white">No generations yet</p>
          <p className="mt-1 text-sm">
            Generate your first Terraform output to see it here.
          </p>
          <Link to="/generate" className="btn-primary mt-4 inline-flex">
            Start now
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((it) => {
            const resources = it.resources_identified || [];
            const provider = it.cloud_provider;
            const isSelected = selected.includes(it.generation_id);
            return (
              <li key={it.generation_id} className="relative">
                <button
                  type="button"
                  onClick={() => toggleSelect(it.generation_id)}
                  title={isSelected ? "Deselect" : "Select to compare"}
                  aria-pressed={isSelected}
                  className={`absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-md border text-[11px] font-bold transition ${
                    isSelected
                      ? "border-brand-300 bg-brand-400 text-ink-900"
                      : "border-white/20 bg-ink-900/70 text-transparent hover:border-brand-300/60 hover:text-slate-400"
                  }`}
                >
                  ✓
                </button>
                <Link
                  to={`/result/${it.generation_id}`}
                  className={`card group flex h-full min-w-0 flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-300/40 hover:bg-white/[0.08] hover:shadow-glow ${
                    isSelected ? "border-brand-300/50 ring-1 ring-brand-300/40" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${
                        PROVIDER_GRADIENT[provider] || "from-slate-500/80 to-slate-700/80"
                      } text-sm font-bold text-white shadow-glow ring-1 ring-white/10`}
                    >
                      {(PROVIDER_LABEL[provider] || provider || "?").slice(0, 3)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge>{it.environment}</Badge>
                        <Badge>{it.input_type}</Badge>
                        {typeof it.diagram_match_percent === "number" && (
                          <Badge tone="storage">{it.diagram_match_percent}% match</Badge>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">{formatDate(it.created_at)}</p>
                    </div>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-1 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-brand-300"
                      aria-hidden
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {resources.length
                        ? `${resources.length} resource${resources.length === 1 ? "" : "s"}`
                        : "Resources"}
                    </p>
                    {resources.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {resources.slice(0, 5).map((r, i) => (
                          <span
                            key={`${r}-${i}`}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300"
                          >
                            {r}
                          </span>
                        ))}
                        {resources.length > 5 && (
                          <span className="rounded-md px-2 py-0.5 text-xs text-slate-500">
                            +{resources.length - 5} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No resources extracted</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-slate-500">
                    <span className="font-mono text-[11px]">
                      #{it.generation_id.slice(0, 8)}
                    </span>
                    <span className="font-medium text-brand-300/80 transition group-hover:text-brand-200">
                      View result
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-ink-900/95 px-4 py-2.5 shadow-glow backdrop-blur">
            <span className="text-sm text-slate-300">
              {selected.length === 1
                ? "Select one more to compare"
                : "2 selected"}
            </span>
            <button
              type="button"
              onClick={compareSelected}
              disabled={selected.length !== 2}
              className="btn-primary px-4 py-1.5 text-sm disabled:opacity-40"
            >
              Compare
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
