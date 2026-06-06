import React, { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { Link } from "react-router-dom";
import CodeViewer from "../components/CodeViewer/CodeViewer.jsx";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import { reviewTerraform } from "../services/api.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
    reader.readAsText(file);
  });
}

async function extractFiles(fileList) {
  const result = {};
  for (const file of fileList) {
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (path.endsWith(".tf") || path.endsWith(".tfvars"))) {
          const name = path.split("/").pop();
          result[name] = await zipEntry.async("string");
        }
      }
    } else if (file.name.endsWith(".tf") || file.name.endsWith(".tfvars")) {
      result[file.name] = await readFileAsText(file);
    }
  }
  return result;
}

// ── Severity config ──────────────────────────────────────────────────────────

const SEV = {
  critical: { label: "Critical", dot: "bg-rose-500",   text: "text-rose-300",   border: "border-rose-500/30",  bg: "bg-rose-500/8"   },
  high:     { label: "High",     dot: "bg-orange-500", text: "text-orange-300", border: "border-orange-500/30",bg: "bg-orange-500/8" },
  medium:   { label: "Medium",   dot: "bg-amber-500",  text: "text-amber-300",  border: "border-amber-500/30", bg: "bg-amber-500/8"  },
  low:      { label: "Low",      dot: "bg-blue-500",   text: "text-blue-300",   border: "border-blue-500/30",  bg: "bg-blue-500/8"   },
};

const CAT_COLOR = {
  security:     "bg-rose-500/15 text-rose-300",
  cost:         "bg-emerald-500/15 text-emerald-300",
  reliability:  "bg-brand-500/15 text-brand-300",
  best_practice:"bg-violet-500/15 text-violet-300",
  compliance:   "bg-amber-500/15 text-amber-300",
};

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ files, onFiles, onError }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    onError(null);
    try {
      const extracted = await extractFiles(Array.from(e.dataTransfer.files));
      if (Object.keys(extracted).length === 0) {
        onError("No .tf or .tfvars files found — upload .tf files or a .zip containing them.");
        return;
      }
      onFiles((prev) => ({ ...prev, ...extracted }));
    } catch (err) {
      onError(err.message);
    }
  }, [onFiles, onError]);

  const handleChange = async (e) => {
    onError(null);
    try {
      const extracted = await extractFiles(Array.from(e.target.files));
      if (Object.keys(extracted).length === 0) {
        onError("No .tf or .tfvars files found.");
        return;
      }
      onFiles((prev) => ({ ...prev, ...extracted }));
    } catch (err) {
      onError(err.message);
    }
    e.target.value = "";
  };

  const fileCount = Object.keys(files).length;

  return (
    <div
      className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition ${
        dragging
          ? "border-brand-400/60 bg-brand-500/10"
          : fileCount > 0
          ? "border-emerald-400/40 bg-emerald-500/5"
          : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".tf,.tfvars,.zip"
        className="hidden"
        onChange={handleChange}
      />

      {fileCount > 0 ? (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-emerald-300">
            {fileCount} file{fileCount !== 1 ? "s" : ""} loaded
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Object.keys(files).map((name) => (
              <span key={name} className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                {name}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">Click or drop more files to add</p>
        </>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-slate-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-200">Drop your Terraform files here</p>
            <p className="mt-1 text-xs text-slate-500">
              Upload individual <code className="font-mono text-slate-400">.tf</code> files or a{" "}
              <code className="font-mono text-slate-400">.zip</code> containing them
            </p>
          </div>
          <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            Browse files
          </span>
        </>
      )}
    </div>
  );
}

// ── Issue card ────────────────────────────────────────────────────────────────

function IssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const sev = SEV[issue.severity] || SEV.low;
  const catStyle = CAT_COLOR[issue.category] || "bg-slate-500/15 text-slate-300";

  return (
    <div className={`rounded-xl border ${sev.border} ${sev.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3.5 text-left hover:brightness-110 transition"
      >
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${sev.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{issue.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${catStyle}`}>
              {issue.category.replace("_", " ")}
            </span>
            <span className={`text-xs font-medium ${sev.text}`}>{sev.label}</span>
          </div>
          {issue.file && (
            <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{issue.file}</span>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mt-1 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-2">
          <p className="text-sm text-slate-300 leading-relaxed">{issue.detail}</p>
          {issue.fix && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 shrink-0 text-emerald-400">
                <path d="m9 11 3 3L22 4"/>
              </svg>
              <p className="text-xs text-emerald-300">{issue.fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stats bar ────────────────────────────────────────────────────────────────

function SeverityBar({ issues }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;

  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(SEV).map(([key, cfg]) => (
        counts[key] > 0 && (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
            <span className={`text-sm font-bold ${cfg.text}`}>{counts[key]}</span>
            <span className="text-xs text-slate-500">{cfg.label}</span>
          </div>
        )
      ))}
      {issues.length === 0 && (
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-bold text-emerald-300">0 issues</span>
        </div>
      )}
    </div>
  );
}

// ── Diff viewer (side-by-side) ────────────────────────────────────────────────

function FileDiff({ filename, original, improved }) {
  const [view, setView] = useState("improved");

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-3">
        <span className="font-mono text-sm font-semibold text-slate-200">{filename}</span>
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {["original", "improved"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                view === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {v === "improved" ? "Improved" : "Original"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        {view === "improved" && original !== improved && (
          <div className="absolute right-3 top-2 z-10">
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              Updated
            </span>
          </div>
        )}
        <pre className="overflow-x-auto bg-ink-950 p-4 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre max-h-[500px] overflow-y-auto">
          {view === "improved" ? improved : original}
        </pre>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Review() {
  const [files, setFiles] = useState({});
  const [uploadError, setUploadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const resultRef = useRef(null);

  const removeFile = (name) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (Object.keys(files).length === 0) return;
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const data = await reviewTerraform({ files });
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setApiError(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const fileCount = Object.keys(files).length;

  // Filter issues by category tab
  const categories = result
    ? ["all", ...new Set(result.issues.map((i) => i.category))]
    : ["all"];

  const visibleIssues = result
    ? activeCategory === "all"
      ? result.issues
      : result.issues.filter((i) => i.category === activeCategory)
    : [];

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = [...visibleIssues].sort(
    (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  );

  return (
    <main className="container-page min-w-0 py-6 sm:py-10 md:py-14">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <header>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-400/20">
              New in v1.6
            </span>
          </div>
          <h1 className="heading-display text-3xl sm:text-4xl">Review Existing Terraform</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Upload your existing <code className="font-mono text-slate-300">.tf</code> files. TerraSketch
            will audit them for security issues, cost inefficiencies, reliability gaps, and best-practice
            violations — then give you an improved version ready to use.
          </p>
        </header>

        {/* Upload card */}
        <div className="card-glow space-y-5 p-5 sm:p-8">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Upload Terraform files
            </label>
            <UploadZone files={files} onFiles={setFiles} onError={setUploadError} />
            {uploadError && (
              <p className="mt-2 text-xs text-rose-300">{uploadError}</p>
            )}
          </div>

          {/* Loaded files list with remove */}
          {fileCount > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Files queued for review ({fileCount})
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(files).map((name) => (
                  <div key={name} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 pl-2.5 pr-1 py-1">
                    <span className="font-mono text-xs text-slate-300">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(name)}
                      className="grid h-5 w-5 place-items-center rounded text-slate-500 hover:text-rose-300 transition"
                      aria-label={`Remove ${name}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {apiError && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              <p className="font-semibold">Analysis failed</p>
              <p className="mt-1 text-rose-200/80">{apiError}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Files are sent to the LLM for analysis — they are not stored permanently.
            </p>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={fileCount === 0 || loading}
              className="btn-primary w-full justify-center py-3.5 sm:w-auto sm:min-w-[200px] sm:py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size={16} />
                  Analyzing…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Analyze & Improve
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {result && (
          <div ref={resultRef} className="space-y-8">

            {/* Summary row */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Review Summary</p>
                  <p className="text-sm font-bold text-white">{result.cloud_provider?.toUpperCase()} · {fileCount} file{fileCount !== 1 ? "s" : ""} analyzed</p>
                </div>
              </div>
              {result.summary && (
                <p className="text-sm text-slate-300 leading-relaxed mb-4">{result.summary}</p>
              )}
              <SeverityBar issues={result.issues} />
            </div>

            {/* Issues section */}
            {result.issues.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Issues Found</h2>
                    <p className="text-xs text-slate-400">{result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} — all fixed in the improved files below</p>
                  </div>
                </div>

                {/* Category filter tabs */}
                {categories.length > 2 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          activeCategory === cat
                            ? "bg-white/15 text-white"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {cat === "all" ? `All (${result.issues.length})` : cat.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {sortedIssues.map((issue, i) => (
                    <IssueCard key={i} issue={issue} />
                  ))}
                </div>
              </section>
            )}

            {/* Changes made */}
            {result.changes?.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Changes Applied</h2>
                    <p className="text-xs text-slate-400">{result.changes.length} improvement{result.changes.length !== 1 ? "s" : ""} made to your files</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
                  {result.changes.map((change, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <p className="text-sm text-slate-300 leading-relaxed">{change}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Improved files */}
            {Object.keys(result.improved_files).length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Improved Files</h2>
                    <p className="text-xs text-slate-400">Toggle between original and improved — copy or download when ready</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {Object.entries(result.improved_files).map(([name, content]) => (
                    <FileDiff
                      key={name}
                      filename={name}
                      original={result.original_files?.[name] || ""}
                      improved={content}
                    />
                  ))}
                </div>

                {/* Code viewer for easy copy/download */}
                <div className="mt-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Copy individual files
                  </p>
                  <CodeViewer files={result.improved_files} />
                </div>
              </section>
            )}

            {/* No issues found */}
            {result.issues.length === 0 && (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/8 p-8 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </span>
                </div>
                <h3 className="text-base font-bold text-emerald-300">Looking good!</h3>
                <p className="mt-1 text-sm text-slate-400">No issues found. Your Terraform follows best practices.</p>
              </div>
            )}

            {/* CTA */}
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setResult(null); setFiles({}); }}
                className="btn-secondary"
              >
                Review another set of files
              </button>
              <Link to="/generate" className="btn-primary">
                Generate new Terraform
              </Link>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
