/**
 * ResultV2 — result page for v2 agentic generation.
 *
 * Mirrors Result.jsx but adds the AgentTrace "Why this code?" panel
 * and exposes HITL edit buttons for IR, Plan, and Files.
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AgentTrace from "../components/insights/AgentTrace";
import CodeViewer from "../components/CodeViewer/CodeViewer";
import { editGenerationIR, editGenerationPlan, editGenerationFiles } from "../services/api";
import { downloadZip } from "../utils/downloadZip";

export default function ResultV2() {
  const { state: locationState } = useLocation();
  const navigate = useNavigate();
  const result = locationState?.result;

  const [activeEditTab, setActiveEditTab] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [liveResult, setLiveResult] = useState(result);

  if (!liveResult) {
    return (
      <div className="p-8 text-center text-gray-500">
        No v2 result found. Go back and generate.
      </div>
    );
  }

  const { trace, files, validation, resource_plan, diagram_ir } = liveResult;
  const generationId = locationState?.generationId;

  const validPercent =
    validation?.valid === true
      ? 100
      : validation?.valid === false
        ? 0
        : null;

  async function handleEditIR() {
    if (!generationId || !diagram_ir) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await editGenerationIR(generationId, diagram_ir);
      setLiveResult(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const tfFiles = files
    ? {
        "main.tf": files.main_tf ?? files["main.tf"] ?? "",
        "variables.tf": files.variables_tf ?? files["variables.tf"] ?? "",
        "outputs.tf": files.outputs_tf ?? files["outputs.tf"] ?? "",
        "providers.tf": files.providers_tf ?? files["providers.tf"] ?? "",
      }
    : {};

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">v2 Generation Result</h1>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Validation badge */}
      {validation && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
            validation.valid === true
              ? "bg-green-100 text-green-800"
              : validation.valid === null
                ? "bg-gray-100 text-gray-600"
                : "bg-red-100 text-red-700"
          }`}
        >
          {validation.valid === true
            ? `✓ Validated (${validation.iterations} iter${validation.iterations !== 1 ? "s" : ""})`
            : validation.valid === null
              ? "⚠ Validation skipped"
              : `✗ Validation failed (${validation.iterations} iters)`}
        </div>
      )}

      {/* Resource plan summary */}
      {resource_plan?.resources?.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Planned resources ({resource_plan.resources.length})
          </h2>
          <ul className="grid grid-cols-2 gap-1 text-xs text-gray-600">
            {resource_plan.resources.map((r) => (
              <li key={r.local_id} className="flex gap-1">
                <span className="font-mono text-indigo-700">{r.local_id}</span>
                <span className="text-gray-400">→</span>
                <span>{r.terraform_type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Files viewer */}
      {Object.keys(tfFiles).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Generated Files</h2>
            <button
              onClick={() => downloadZip(tfFiles, "terrasketch-v2.zip")}
              className="text-xs text-indigo-600 hover:underline"
            >
              Download ZIP
            </button>
          </div>
          <CodeViewer files={tfFiles} />
        </div>
      )}

      {/* HITL edit buttons */}
      {generationId && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleEditIR}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
          >
            Re-run from IR edit
          </button>
        </div>
      )}

      {/* Why this code? */}
      <AgentTrace trace={trace} />

      {loading && (
        <div className="text-center text-sm text-gray-500">Re-running from edited state…</div>
      )}
    </div>
  );
}
