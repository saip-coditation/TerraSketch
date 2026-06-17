import React, { useEffect, useRef, useState } from "react";

/**
 * ThinkingStream — live view of the model's reasoning and the Terraform config
 * as they stream in. Two tabs: "Thinking" (extended-thinking deltas) and
 * "Configuration" (the tool-input JSON / files being written).
 */
export default function ThinkingStream({ thinking = "", output = "", active = false }) {
  const [tab, setTab] = useState("thinking");
  const thinkRef = useRef(null);
  const outRef = useRef(null);

  // Auto-switch to Configuration once code starts arriving (thinking has wound down).
  useEffect(() => {
    if (output && !thinking) setTab("configuration");
  }, [output, thinking]);

  // Keep the active pane scrolled to the latest content.
  useEffect(() => {
    const el = tab === "thinking" ? thinkRef.current : outRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinking, output, tab]);

  if (!active && !thinking && !output) return null;

  const TabButton = ({ id, label, badge }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        tab === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
      }`}
    >
      {label}
      {badge && (
        <span className="rounded-full bg-brand-500/20 px-1.5 py-0 text-[10px] text-brand-300">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {active && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/70" />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-brand-400" : "bg-slate-500"}`} />
          </span>
          <p className="text-sm font-semibold text-slate-100">
            {active ? "Generating…" : "Generation trace"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <TabButton id="thinking" label="Thinking" />
          <TabButton id="configuration" label="Configuration" />
        </div>
      </div>

      {tab === "thinking" ? (
        <div
          ref={thinkRef}
          className="max-h-72 overflow-auto px-5 py-4 text-[13px] leading-relaxed text-slate-300"
        >
          {thinking ? (
            <p className="whitespace-pre-wrap font-mono">{thinking}</p>
          ) : (
            <p className="text-sm text-slate-500">
              {active ? "Waiting for the model to start reasoning…" : "No thinking captured."}
            </p>
          )}
        </div>
      ) : (
        <div ref={outRef} className="max-h-72 overflow-auto bg-ink-900/60 px-5 py-4">
          {output ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-slate-300">
              {output}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">
              {active ? "Configuration will appear here as it's written…" : "No configuration captured."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
