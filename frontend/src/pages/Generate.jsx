import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import GeneratorPanel from "../components/GeneratorPanel/GeneratorPanel.jsx";
import { generateTerraform } from "../services/api.js";
import { getSessionId } from "../utils/sessionId.js";

export default function Generate() {
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (payload) => {
    setLoading(true);
    setGlobalError(null);
    try {
      const result = await generateTerraform({
        ...payload,
        session_id: getSessionId(),
      });
      navigate(`/result/${result.generation_id}`, { state: result });
    } catch (err) {
      setGlobalError(err.message || "Failed to generate Terraform");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container-page py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Generate Terraform
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Upload a diagram or describe your architecture in text. We'll do the rest.
          </p>
        </header>

        <GeneratorPanel onSubmit={handleSubmit} loading={loading} />

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
