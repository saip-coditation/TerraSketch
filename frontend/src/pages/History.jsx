import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const loading = !ready || fetching;

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
        <Link to="/generate" className="btn-primary w-full justify-center py-3.5 sm:w-auto sm:py-2">
          New generation
        </Link>
      </header>

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
            return (
              <li key={it.generation_id}>
                <Link
                  to={`/result/${it.generation_id}`}
                  className="card group flex h-full min-w-0 flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-300/40 hover:bg-white/[0.08] hover:shadow-glow"
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
    </main>
  );
}
