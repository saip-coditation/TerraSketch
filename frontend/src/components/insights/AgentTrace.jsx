/**
 * AgentTrace — collapsible "Why this code?" panel for v2 generation results.
 *
 * Displays each node's reasoning, confidence, and decisions from the
 * GenerationTrace returned by POST /api/v2/generate.
 */

import { useState } from "react";

const SEVERITY_COLOR = {
  critical: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-500",
};

function ConfidenceBar({ value }) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

function NodeCard({ name, output }) {
  const [open, setOpen] = useState(false);
  if (!output) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left text-sm font-medium"
      >
        <span className="capitalize">{name}</span>
        <div className="flex items-center gap-3">
          <ConfidenceBar value={output.confidence} />
          {output.duration_ms > 0 && (
            <span className="text-gray-400 text-xs">{(output.duration_ms / 1000).toFixed(1)}s</span>
          )}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 text-sm space-y-3">
          {output.reasoning && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Reasoning</p>
              <p className="text-gray-700 whitespace-pre-wrap">{output.reasoning}</p>
            </div>
          )}

          {output.decisions && output.decisions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Decisions</p>
              <ul className="space-y-1">
                {output.decisions.map((d, i) => (
                  <li key={i} className="text-gray-700">
                    <span className="font-medium">{d.question}:</span> {d.choice}
                    {d.alternatives_considered?.length > 0 && (
                      <span className="text-gray-400 ml-1">
                        (considered: {d.alternatives_considered.join(", ")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentTrace({ trace }) {
  const [open, setOpen] = useState(false);
  if (!trace) return null;

  const fixerCount = trace.fixer_iterations?.length ?? 0;

  return (
    <div className="mt-4 border border-indigo-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-indigo-50 hover:bg-indigo-100 text-left"
      >
        <span className="font-semibold text-indigo-800 text-sm">
          Why this code?
          {fixerCount > 0 && (
            <span className="ml-2 text-xs font-normal text-indigo-500">
              ({fixerCount} fix iteration{fixerCount > 1 ? "s" : ""})
            </span>
          )}
        </span>
        <span className="text-indigo-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-4 bg-white">
          <NodeCard name="understand" output={trace.understand} />
          <NodeCard name="plan" output={trace.plan} />
          <NodeCard name="synthesize" output={trace.synthesize} />

          {fixerCount > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                Fix iterations
              </p>
              {trace.fixer_iterations.map((iter, i) => (
                <NodeCard key={i} name={`fixer (iter ${i + 1})`} output={iter} />
              ))}
            </div>
          )}

          <NodeCard name="validate" output={trace.validate} />
          <NodeCard name="clarify" output={trace.clarify} />
          <NodeCard name="critique" output={trace.critique} />
          <NodeCard name="explain" output={trace.explain} />
        </div>
      )}
    </div>
  );
}
