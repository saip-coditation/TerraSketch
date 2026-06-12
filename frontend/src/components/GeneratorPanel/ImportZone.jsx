import React, { useCallback, useRef, useState } from "react";
import { parseImportFile } from "../../utils/drawioParser.js";

const PROVIDER_COLORS = {
  aws: { dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-400/30" },
  azure: { dot: "bg-blue-400", text: "text-blue-300", bg: "bg-blue-500/10 border-blue-400/30" },
  gcp: { dot: "bg-red-400", text: "text-red-300", bg: "bg-red-500/10 border-red-400/30" },
};

export default function ImportZone({ onParsed, onError }) {
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null); // parsed import result
  const inputRef = useRef(null);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setParsing(true);
      setResult(null);
      onError?.(null);
      try {
        const parsed = await parseImportFile(file);
        setResult(parsed);
        onParsed?.(parsed);
      } catch (err) {
        onError?.(err.message || "Failed to parse file.");
        setResult(null);
        onParsed?.(null);
      } finally {
        setParsing(false);
      }
    },
    [onParsed, onError]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile]
  );

  const clearFile = () => {
    setResult(null);
    onParsed?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const providerColors = result?.provider ? PROVIDER_COLORS[result.provider] : null;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex min-h-[9rem] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition sm:min-h-0 sm:p-8 ${
          dragOver
            ? "border-violet-400 bg-violet-400/10"
            : "border-white/15 bg-ink-900/40 hover:border-white/25 hover:bg-white/5"
        }`}
      >
        {parsing ? (
          <>
            <span className="mb-3 grid h-12 w-12 animate-spin place-items-center rounded-full border-2 border-violet-400/30 border-t-violet-400" />
            <p className="text-sm font-medium text-slate-300">Parsing diagram…</p>
          </>
        ) : (
          <>
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5">
              {/* File import icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 18 15 15" />
              </svg>
            </span>
            <p className="text-sm font-medium text-white">
              Drop your diagram file here or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-400">
              .drawio &nbsp;·&nbsp; .xml (draw.io export) &nbsp;·&nbsp; .excalidraw
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".drawio,.xml,.excalidraw,application/xml,text/xml"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </button>

      {/* Parsed preview */}
      {result && (
        <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-400/30 bg-violet-500/10">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{result.fileName}</p>
                <p className="text-xs text-slate-400">Successfully parsed</p>
              </div>
            </div>
            <button type="button" onClick={clearFile} className="btn-ghost shrink-0 text-xs">
              Remove
            </button>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-2">
            {result.provider && providerColors && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${providerColors.bg} ${providerColors.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${providerColors.dot}`} />
                {result.provider.toUpperCase()} detected
              </span>
            )}
            {!result.provider && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                Provider not detected — select above
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              {result.shapes.length} component{result.shapes.length !== 1 ? "s" : ""}
            </span>
            {result.connections.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
                {result.connections.length} connection{result.connections.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Services list */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Components detected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.shapes.slice(0, 20).map((s, i) => (
                <span
                  key={i}
                  className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300"
                  title={s.label && s.label !== s.serviceName ? `Labeled: "${s.label}"` : undefined}
                >
                  {s.serviceName}
                  {s.label && s.label !== s.serviceName && (
                    <span className="ml-1 text-slate-500">({s.label})</span>
                  )}
                </span>
              ))}
              {result.shapes.length > 20 && (
                <span className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-500">
                  +{result.shapes.length - 20} more
                </span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            A full text description of your diagram will be sent to the AI for Terraform generation.
            You can add extra notes in the Correction field below.
          </p>
        </div>
      )}
    </div>
  );
}
