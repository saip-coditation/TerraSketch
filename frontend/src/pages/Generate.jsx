import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import GeneratorPanel from "../components/GeneratorPanel/GeneratorPanel.jsx";
import ClarifyingQuestions from "../components/GeneratorPanel/ClarifyingQuestions.jsx";
import GenerationProgress from "../components/GenerationProgress.jsx";
import { generateTerraform, applyGenerationConfig } from "../services/api.js";
import { getSessionId } from "../utils/sessionId.js";

export default function Generate() {
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  // Non-null while config MCQs (canonical microservice) await answers.
  // { generationId, questions, baseResult }
  const [clarify, setClarify] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state?.prefill || null;

  const goToResult = (result) => {
    setClarify(null);
    try {
      sessionStorage.setItem("terrasketch_last_generation_id", result.generation_id || "");
    } catch {
      /* ignore */
    }
    navigate(`/result/${result.generation_id}`, { state: result });
  };

  const handleResult = (result) => {
    // Canonical microservice was applied → offer config MCQs before the result.
    if (result.clarifying_questions && result.clarifying_questions.length > 0) {
      setClarify({
        generationId: result.generation_id,
        questions: result.clarifying_questions,
        baseResult: result,
      });
      return;
    }
    goToResult(result);
  };

  const handleSubmit = async (payload) => {
    setLoading(true);
    setGlobalError(null);
    try {
      const result = await generateTerraform({
        ...payload,
        session_id: getSessionId(),
      });
      handleResult(result);
    } catch (err) {
      const extra = err.requestId != null ? ` (request ID: ${err.requestId})` : "";
      setGlobalError((err.message || "Failed to generate Terraform") + extra);
    } finally {
      setLoading(false);
    }
  };

  // MCQ answers → apply to the stored generation's template variables (no LLM),
  // then continue to the result page.
  const handleClarifySubmit = async (answers) => {
    setLoading(true);
    setGlobalError(null);
    try {
      const result = await applyGenerationConfig(clarify.generationId, answers);
      goToResult(result);
    } catch (err) {
      const extra = err.requestId != null ? ` (request ID: ${err.requestId})` : "";
      setGlobalError((err.message || "Failed to apply configuration") + extra);
    } finally {
      setLoading(false);
    }
  };

  // Skip the questions and use the recommended/default configuration.
  const handleSkip = () => {
    if (clarify?.baseResult) goToResult(clarify.baseResult);
  };

  return (
    <main className="container-page min-w-0 py-6 sm:py-10 md:py-14">
      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <header className="mb-8">
          <h1 className="heading-display text-3xl sm:text-4xl">Generate Terraform</h1>
          <p className="mt-2 text-sm text-slate-400">
            Upload a diagram or describe your architecture. Presets and corrections steer the model;
            optional diff vs your last run.
          </p>
        </header>

        {clarify ? (
          <div>
            <div className="mb-4 rounded-xl border border-brand-400/30 bg-brand-400/5 p-4 text-sm text-slate-300">
              <p className="font-semibold text-slate-100">A few quick choices</p>
              <p className="mt-1 text-slate-400">
                Pick sizing, scaling, logging and backups for your stack — just tap the options.
                Recommended defaults are pre-selected, or skip to use them.
              </p>
            </div>
            <ClarifyingQuestions
              key={clarify.questions.map((q) => q.id).join(",")}
              questions={clarify.questions}
              diagramIr={null}
              onSubmit={handleClarifySubmit}
              loading={loading}
            />
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="mt-4 text-sm text-slate-400 underline underline-offset-4 hover:text-slate-200 disabled:opacity-50"
            >
              Skip — use recommended defaults
            </button>
          </div>
        ) : (
          <div data-tour="generator-panel">
            <GeneratorPanel onSubmit={handleSubmit} loading={loading} prefill={prefill} />
          </div>
        )}

        <GenerationProgress loading={loading} />

        {globalError && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            <p className="font-semibold">Generation failed</p>
            <p className="mt-1 text-rose-200/90">{globalError}</p>
          </div>
        )}
      </div>
    </main>
  );
}
