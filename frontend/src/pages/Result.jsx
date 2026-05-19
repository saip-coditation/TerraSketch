import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import CodeViewer from "../components/CodeViewer/CodeViewer.jsx";
import ResourceMap from "../components/ResourceMap.jsx";
import AssumptionsBox from "../components/AssumptionsBox.jsx";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import Button from "../components/shared/Button.jsx";
import MatchScoreRing from "../components/insights/MatchScoreRing.jsx";
import InsightsDeck from "../components/insights/InsightsDeck.jsx";
import FileDiffSummary from "../components/insights/FileDiffSummary.jsx";
import ShareAndGitCard from "../components/insights/ShareAndGitCard.jsx";
import { getApiBaseUrl, getGeneration, postFeedback } from "../services/api.js";
import CostEstimator from "../components/insights/CostEstimator.jsx";
import CostOptimizer from "../components/insights/CostOptimizer.jsx";
import MermaidExport from "../components/insights/MermaidExport.jsx";
import ComplexityBadge from "../components/insights/ComplexityBadge.jsx";
import SecurityScorePanel from "../components/insights/SecurityScorePanel.jsx";
import { getSessionId } from "../utils/sessionId.js";

function formatProvider(p) {
  return { aws: "AWS", azure: "Azure", gcp: "Google Cloud" }[p] || p;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="grid h-11 w-11 place-items-center text-slate-500 transition active:scale-95 hover:text-amber-300 sm:h-9 sm:w-9"
          aria-label={`Rate ${n} out of 5`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={value >= n ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={value >= n ? "text-amber-300" : ""}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function Result() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initial = location.state || null;

  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackState, setFeedbackState] = useState("idle");

  useEffect(() => {
    if (initial?.generation_id === id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getGeneration(id);
        if (!cancel) setData(result);
      } catch (err) {
        if (!cancel) setError(err.message || "Failed to load generation");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id, initial]);

  const submitFeedback = async () => {
    if (!rating) return;
    setFeedbackState("submitting");
    try {
      await postFeedback({ generationId: id, rating, comment });
      setFeedbackState("submitted");
    } catch (err) {
      setFeedbackState("error");
      setError(err.message || "Failed to submit feedback");
    }
  };

  if (loading) {
    return (
      <main className="container-page min-w-0 py-20">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-300">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-brand-500/20" />
            <LoadingSpinner size={28} />
          </div>
          <p className="text-sm text-slate-400">Loading generation…</p>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="container-page min-w-0 py-20">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h2 className="heading-display text-lg">Couldn't load this generation</h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <Link to="/generate" className="btn-primary mt-4 inline-flex">
            Start a new one
          </Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const sessionHint = getSessionId().slice(0, 8);

  return (
    <main className="container-page min-w-0 space-y-6 py-6 sm:space-y-8 sm:py-10 md:py-14">
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-xs uppercase leading-relaxed tracking-wider text-brand-300/90">
            Generation ·{" "}
            <span className="font-mono text-slate-300">{data.generation_id?.slice(0, 8)}</span>
            <span className="text-slate-600"> · session {sessionHint}…</span>
          </p>
          <h1 className="heading-display mt-1 break-words text-2xl sm:text-3xl md:text-4xl">
            {formatProvider(data.cloud_provider)}{" "}
            <span className="text-slate-400 font-normal text-xl sm:text-2xl md:text-3xl">
              · {data.environment}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Created {formatDate(data.created_at)}</p>
          {data.request_id && (
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              Request ID: {data.request_id}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Link to="/history" className="btn-secondary w-full justify-center py-3.5 sm:w-auto sm:py-2">
            History
          </Link>
          {data?.input_description && (
            <button
              type="button"
              onClick={() =>
                navigate("/generate", {
                  state: {
                    prefill: {
                      text: data.input_description,
                      provider: data.cloud_provider,
                      environment: data.environment,
                      inputType: data.input_type,
                    },
                  },
                })
              }
              className="btn-secondary w-full justify-center py-3.5 sm:w-auto sm:py-2"
            >
              Re-generate
            </button>
          )}
          <Link to="/generate" className="btn-primary w-full justify-center py-3.5 sm:w-auto sm:py-2">
            New generation
          </Link>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,340px),minmax(0,1fr)] xl:items-start">
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <MatchScoreRing percent={data.diagram_match_percent ?? 0} />
          <ComplexityBadge resources={data.resources_identified || []} />
          <SecurityScorePanel
            files={data.files || {}}
            securityWarnings={data.security_warnings || []}
          />
          <InsightsDeck
            improvementAdvice={data.improvement_advice || []}
            securityWarnings={data.security_warnings || []}
            terraformValidation={data.terraform_validation}
          />
          <CostEstimator
            resources={data.resources_identified || []}
            cloudProvider={data.cloud_provider}
          />
          <CostOptimizer
            files={data.files || {}}
            resources={data.resources_identified || []}
            cloudProvider={data.cloud_provider}
            environment={data.environment}
          />
          <MermaidExport resources={data.resources_identified || []} />
          <FileDiffSummary summary={data.file_diff_summary} />
          <ShareAndGitCard
            generationId={data.generation_id}
            requestId={data.request_id}
            apiBase={getApiBaseUrl()}
          />
        </aside>

        <div className="space-y-6 min-w-0">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Resources identified
            </h2>
            <ResourceMap resources={data.resources_identified || []} />
          </section>

          <AssumptionsBox
            assumptions={data.assumptions}
            usageInstructions={data.usage_instructions}
          />

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Terraform output
            </h2>
            <CodeViewer files={data.files || {}} />
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Was this useful?
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Help improve TerraSketch — your rating tunes future generations.
            </p>
            {feedbackState === "submitted" ? (
              <p className="mt-3 text-sm text-emerald-300">Thanks for the feedback!</p>
            ) : (
              <div className="mt-3 space-y-3">
                <StarRating value={rating} onChange={setRating} />
                <textarea
                  className="textarea min-h-[80px]"
                  placeholder="Optional comment — what worked or didn't?"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    className="w-full justify-center sm:w-auto"
                    onClick={submitFeedback}
                    disabled={!rating || feedbackState === "submitting"}
                  >
                    {feedbackState === "submitting" ? "Sending…" : "Submit feedback"}
                  </Button>
                  {feedbackState === "error" && (
                    <span className="text-xs text-rose-300">
                      Couldn't submit — please try again.
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
