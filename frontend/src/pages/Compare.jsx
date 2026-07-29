import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getGeneration } from "../services/api.js";
import { diffFileMaps } from "../utils/lineDiff.js";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import Badge from "../components/shared/Badge.jsx";

function shortId(id) {
  return id ? `#${id.slice(0, 8)}` : "";
}

const STATUS_TONE = {
  added: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  removed: "text-rose-300 border-rose-400/40 bg-rose-400/10",
  changed: "text-amber-200 border-amber-400/40 bg-amber-400/10",
  unchanged: "text-slate-400 border-white/10 bg-white/5",
};

function FileDiff({ file }) {
  const [open, setOpen] = useState(file.status === "changed");
  const hasRows = file.status === "changed" && file.rows.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900/40">
      <button
        type="button"
        onClick={() => hasRows && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
          hasRows ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-default"
        }`}
      >
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
            STATUS_TONE[file.status]
          }`}
        >
          {file.status}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">
          {file.name}
        </span>
        {(file.added > 0 || file.removed > 0) && (
          <span className="shrink-0 font-mono text-xs">
            {file.added > 0 && <span className="text-emerald-300">+{file.added}</span>}
            {file.added > 0 && file.removed > 0 && " "}
            {file.removed > 0 && <span className="text-rose-300">-{file.removed}</span>}
          </span>
        )}
        {hasRows && (
          <span className="shrink-0 text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        )}
      </button>

      {open && hasRows && (
        <div className="max-h-[28rem] overflow-auto border-t border-white/10 bg-black/30">
          <table className="w-full border-collapse font-mono text-[12px] leading-relaxed">
            <tbody>
              {file.rows.map((r, i) => (
                <tr
                  key={i}
                  className={
                    r.type === "add"
                      ? "bg-emerald-500/10"
                      : r.type === "del"
                        ? "bg-rose-500/10"
                        : ""
                  }
                >
                  <td className="select-none whitespace-pre px-2 text-right text-slate-600">
                    {r.aLine ?? ""}
                  </td>
                  <td className="select-none whitespace-pre px-2 text-right text-slate-600">
                    {r.bLine ?? ""}
                  </td>
                  <td
                    className={`select-none px-2 ${
                      r.type === "add"
                        ? "text-emerald-300"
                        : r.type === "del"
                          ? "text-rose-300"
                          : "text-slate-600"
                    }`}
                  >
                    {r.type === "add" ? "+" : r.type === "del" ? "-" : " "}
                  </td>
                  <td
                    className={`whitespace-pre-wrap break-all px-2 ${
                      r.type === "add"
                        ? "text-emerald-100"
                        : r.type === "del"
                          ? "text-rose-100"
                          : "text-slate-400"
                    }`}
                  >
                    {r.text || " "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");

  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!aId || !bId) {
      setError("Pick two generations to compare from the History page.");
      setLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ra, rb] = await Promise.all([getGeneration(aId), getGeneration(bId)]);
        if (!cancel) {
          setA(ra);
          setB(rb);
        }
      } catch (err) {
        if (!cancel) setError(err.message || "Failed to load one of the generations.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [aId, bId]);

  const files = useMemo(
    () => (a && b ? diffFileMaps(a.files || {}, b.files || {}) : []),
    [a, b]
  );
  const changedCount = files.filter((f) => f.status !== "unchanged").length;

  return (
    <main className="container-page min-w-0 py-10 sm:py-14">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Compare</h1>
          <Link to="/history" className="text-sm text-brand-300 hover:text-brand-200">
            ← Back to history
          </Link>
        </div>
        {a && b && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span className="font-mono">{shortId(aId)}</span>
            <span>→</span>
            <span className="font-mono">{shortId(bId)}</span>
            <Badge tone={changedCount ? "storage" : "network"}>
              {changedCount ? `${changedCount} file${changedCount === 1 ? "" : "s"} changed` : "identical"}
            </Badge>
          </p>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-300">
          <LoadingSpinner size={20} /> Loading both generations…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Left column = line in <span className="font-mono">{shortId(aId)}</span>, right column ={" "}
            <span className="font-mono">{shortId(bId)}</span>. Changed files are expanded by default.
          </p>
          {files.map((f) => (
            <FileDiff key={f.name} file={f} />
          ))}
        </div>
      )}
    </main>
  );
}
