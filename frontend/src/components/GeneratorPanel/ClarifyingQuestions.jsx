import React, { useState } from "react";
import Button from "../shared/Button.jsx";
import LoadingSpinner from "../shared/LoadingSpinner.jsx";
import { DiagramPreview } from "../insights/MermaidExport.jsx";

/**
 * MCQ-only clarification step — surfaces structural ambiguities ("what is this
 * box?") or configuration choices ("what size?") as button-group picks, never
 * free text, so the user never has to type. A round only ever contains one
 * `kind` at a time (see backend/app/agents/graph.py's clarify/plan pause points).
 */
export default function ClarifyingQuestions({ questions, diagramIr, onSubmit, loading }) {
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.recommended_index ?? 0]))
  );

  const kind = questions[0]?.kind;
  const highlightNodeIds = kind === "structural" ? questions.map((q) => q.target_node_id) : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(answers);
  };

  return (
    <form onSubmit={handleSubmit} className="card-glow min-w-0 space-y-5 p-4 sm:space-y-6 sm:p-8">
      <div>
        <h2 className="text-lg font-semibold text-white">
          {kind === "structural" ? "A few things to confirm" : "A few sizing choices"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {kind === "structural"
            ? "We're not fully sure about these parts of your diagram — pick the closest match."
            : "Pick sizes/access for the resources we weren't sure about. A sensible default is pre-selected."}
        </p>
      </div>

      {diagramIr?.nodes?.length > 0 && (
        <DiagramPreview
          nodes={diagramIr.nodes}
          edges={diagramIr.edges}
          highlightNodeIds={highlightNodeIds}
        />
      )}

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id}>
            <label className="mb-2 block text-sm font-medium text-slate-200">{q.question}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((opt, idx) => {
                const active = answers[q.id] === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-brand-400/50 bg-brand-500/15 text-white shadow-glow"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {idx === q.recommended_index && (
                      <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-brand-300">
                        recommended
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading} className="min-w-[200px] py-2.5">
          {loading ? (
            <>
              <LoadingSpinner /> Continuing…
            </>
          ) : (
            "Continue generating"
          )}
        </Button>
      </div>
    </form>
  );
}
