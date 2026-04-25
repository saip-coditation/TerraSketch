import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import CodeViewer from "../components/CodeViewer/CodeViewer.jsx";
import ResourceMap from "../components/ResourceMap.jsx";
import AssumptionsBox from "../components/AssumptionsBox.jsx";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import Button from "../components/shared/Button.jsx";
import { getGeneration, postFeedback } from "../services/api.js";

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
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-1 text-slate-500 transition hover:scale-110 hover:text-amber-300"
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
      <main className="container-page py-20">
        <div className="flex items-center justify-center gap-3 text-slate-300">
          <LoadingSpinner size={22} /> Loading generation…
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="container-page py-20">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-white">
            Couldn't load this generation
          </h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <Link to="/generate" className="btn-primary mt-4 inline-flex">
            Start a new one
          </Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="container-page py-10 sm:py-14 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-300">
            Generation · {data.generation_id?.slice(0, 8)}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {formatProvider(data.cloud_provider)} ·{" "}
            <span className="text-slate-300">{data.environment}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Created {formatDate(data.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/history" className="btn-secondary">
            History
          </Link>
          <Link to="/generate" className="btn-primary">
            New generation
          </Link>
        </div>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Resources identified
        </h2>
        <ResourceMap resources={data.resources_identified || []} />
      </section>

      <AssumptionsBox
        assumptions={data.assumptions}
        usageInstructions={data.usage_instructions}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Terraform output
        </h2>
        <CodeViewer files={data.files || {}} />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Was this useful?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Help improve TerraSketch — your rating tunes future generations.
        </p>
        {feedbackState === "submitted" ? (
          <p className="mt-3 text-sm text-emerald-300">
            Thanks for the feedback!
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <StarRating value={rating} onChange={setRating} />
            <textarea
              className="textarea min-h-[80px]"
              placeholder="Optional comment — what worked or didn't?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
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
    </main>
  );
}
