import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import GeneratorPanel from "../components/GeneratorPanel/GeneratorPanel.jsx";
import GenerationProgress from "../components/GenerationProgress.jsx";
import ThinkingStream from "../components/ThinkingStream.jsx";
import { generateTerraform, generateTerraformStream } from "../services/api.js";
import { getSessionId } from "../utils/sessionId.js";

export default function Generate() {
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [thinking, setThinking] = useState("");
  const [output, setOutput] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state?.prefill || null;

  const handleSubmit = async (payload) => {
    setLoading(true);
    setGlobalError(null);
    setThinking("");
    setOutput("");
    const full = { ...payload, session_id: getSessionId() };
    try {
      let result;
      try {
        // Preferred path: live streaming with the Thinking tab.
        result = await generateTerraformStream(full, {
          onThinking: (t) => setThinking((prev) => prev + t),
          onOutput: (t) => setOutput((prev) => prev + t),
        });
      } catch (streamErr) {
        // Streaming unavailable (older backend, non-Anthropic provider, etc.) →
        // fall back to the standard non-streaming endpoint.
        result = await generateTerraform(full);
      }
      try {
        sessionStorage.setItem("terrasketch_last_generation_id", result.generation_id);
      } catch {
        /* ignore */
      }
      navigate(`/result/${result.generation_id}`, { state: result });
    } catch (err) {
      const extra =
        err.requestId != null ? ` (request ID: ${err.requestId})` : "";
      setGlobalError((err.message || "Failed to generate Terraform") + extra);
    } finally {
      setLoading(false);
    }
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

        <div data-tour="generator-panel">
          <GeneratorPanel onSubmit={handleSubmit} loading={loading} prefill={prefill} />
        </div>

        <GenerationProgress loading={loading} />

        <ThinkingStream thinking={thinking} output={output} active={loading} />

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
