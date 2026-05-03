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
        <ul className="grid gap-3">
          {items.map((it) => (
            <li key={it.generation_id}>
              <Link
                to={`/result/${it.generation_id}`}
                className="card flex min-w-0 flex-col gap-3 p-4 transition hover:border-brand-300/30 hover:bg-white/[0.07] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="network">
                      {PROVIDER_LABEL[it.cloud_provider] || it.cloud_provider}
                    </Badge>
                    <Badge>{it.environment}</Badge>
                    <Badge>{it.input_type}</Badge>
                    {typeof it.diagram_match_percent === "number" && (
                      <Badge tone="storage">{it.diagram_match_percent}% match</Badge>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-300">
                    {(it.resources_identified || []).slice(0, 6).join(" · ") ||
                      "No resources extracted"}
                    {(it.resources_identified || []).length > 6 && " …"}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>{formatDate(it.created_at)}</p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {it.generation_id.slice(0, 8)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
