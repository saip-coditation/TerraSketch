import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import CodeViewer from "../components/CodeViewer/CodeViewer.jsx";
import ResourceMap from "../components/ResourceMap.jsx";
import AssumptionsBox from "../components/AssumptionsBox.jsx";
import LoadingSpinner from "../components/shared/LoadingSpinner.jsx";
import Button from "../components/shared/Button.jsx";
import InsightsDeck from "../components/insights/InsightsDeck.jsx";
import LintPanel from "../components/insights/LintPanel.jsx";
import FileDiffSummary from "../components/insights/FileDiffSummary.jsx";
import ShareAndGitCard from "../components/insights/ShareAndGitCard.jsx";
import {
  getApiBaseUrl,
  getGeneration,
  postFeedback,
  exportGeneration,
  modularizeGeneration,
  applyStandardTags,
  scaffoldDownloadUrl,
} from "../services/api.js";
import CostBreakdown from "../components/insights/CostBreakdown.jsx";
import HandoffPanel from "../components/insights/HandoffPanel.jsx";
import DeployPanel from "../components/insights/DeployPanel.jsx";
import { downloadZip } from "../utils/downloadZip.js";
import { buildModuleFiles } from "../utils/moduleStructure.js";
import { buildReadme } from "../utils/handoff.js";
import CostOptimizer from "../components/insights/CostOptimizer.jsx";
import MermaidExport from "../components/insights/MermaidExport.jsx";
import SecurityScorePanel from "../components/insights/SecurityScorePanel.jsx";
import TfvarsGenerator from "../components/insights/TfvarsGenerator.jsx";
import ComplianceChecker from "../components/insights/ComplianceChecker.jsx";
import TerraformExplainer from "../components/insights/TerraformExplainer.jsx";
import { getSessionId } from "../utils/sessionId.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatProvider(p) {
  return { aws: "AWS", azure: "Azure", gcp: "Google Cloud" }[p] || p;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Complexity scorer (same logic as ComplexityBadge) ────────────────────────

const COMPLEXITY_SIGNALS = [
  (r) => /vpc|vnet|virtual_network|compute_network|internet_gateway|nat_gateway|subnet/.test(r),
  (r) => /\balb\b|_lb\b|load_balancer|application_gateway|compute_url_map|api_gateway|api_management/.test(r),
  (r) => /instance|ecs_service|lambda|function_app|cloud_run|container_app|virtual_machine|compute_instance/.test(r),
  (r) => /db_instance|rds_cluster|dynamo|cosmos|sql_database|sql_database_instance/.test(r),
  (r) => /redis|elasticache|memorystore/.test(r),
  (r) => /s3_bucket|storage_account|storage_bucket/.test(r),
  (r) => /sqs|sns|pubsub|kinesis|eventhub|servicebus/.test(r),
  (r) => /\biam\b|kms|secretsmanager|key_vault|waf|acm_certificate|secret_manager/.test(r),
  (r) => /eks|ecs_cluster|kubernetes|container_cluster|aks/.test(r),
  (r) => /cloudfront|cdn_profile|compute_global_forwarding/.test(r),
];

function getComplexityLabel(resources) {
  if (!resources?.length) return { label: "—", color: "text-slate-400" };
  const typeStrs = resources.map((r) => (r.includes(":") ? r.split(":")[0] : r));
  const score =
    resources.length * 2 +
    new Set(typeStrs).size * 3 +
    COMPLEXITY_SIGNALS.filter((s) => typeStrs.some(s)).length * 5;
  if (score <= 22) return { label: "Simple", color: "text-emerald-300" };
  if (score <= 50) return { label: "Moderate", color: "text-brand-300" };
  if (score <= 90) return { label: "Complex", color: "text-amber-300" };
  return { label: "Enterprise", color: "text-rose-300" };
}

function avgConfidence(scores) {
  const vals = Object.values(scores || {});
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

// ── Dashboard Stat Card ──────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, valueColor = "text-slate-100", accent }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white/[0.03] p-4 ${
        accent ? `border-${accent}-500/30` : "border-white/8"
      }`}
    >
      {accent && (
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-${accent}-500/10 to-transparent`}
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold leading-none tabular-nums ${valueColor}`}>
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && (
          <span className="shrink-0 rounded-xl bg-white/5 p-2 text-slate-400">{icon}</span>
        )}
      </div>
    </div>
  );
}

// ── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = React.useState(0);
  return (
    <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value >= n;
        const highlight = hovered >= n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="grid h-11 w-11 place-items-center transition-transform active:scale-90 sm:h-9 sm:w-9"
            aria-label={`Rate ${n} out of 5`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={active || highlight ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-colors ${active ? "text-amber-400" : highlight ? "text-amber-300" : "text-slate-400"}`}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
      {value === 0 && hovered === 0 && (
        <span className="ml-2 text-xs text-slate-500">Click to rate</span>
      )}
    </div>
  );
}

// ── Confidence Bar List ──────────────────────────────────────────────────────

function ConfidenceScores({ scores }) {
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const avg = Math.round(entries.reduce((s, [, v]) => s + v, 0) / entries.length);
  const color = (v) => (v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-rose-500");
  const label = (v) => (v >= 80 ? "text-emerald-300" : v >= 60 ? "text-amber-300" : "text-rose-300");

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Confidence per file
        </h3>
        <span className={`text-sm font-bold ${label(avg)}`}>{avg}%</span>
      </div>
      <div className="space-y-2">
        {entries.map(([name, score]) => (
          <div key={name}>
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-xs text-slate-300 truncate">{name}</span>
              <span className={`ml-2 shrink-0 text-xs font-medium ${label(score)}`}>{score}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${color(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {entries.some(([, v]) => v < 60) && (
        <p className="mt-3 text-xs text-rose-300/80">
          Low-confidence files need manual review before deployment.
        </p>
      )}
    </div>
  );
}

// ── Match Score Widget ───────────────────────────────────────────────────────

function MatchScoreWidget({ percent, advice = [] }) {
  const pct = Math.min(100, Math.max(0, percent));
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const color =
    pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : pct >= 40 ? "#f97316" : "#ef4444";
  const label =
    pct >= 80 ? "Great match" : pct >= 60 ? "Good match" : pct >= 40 ? "Partial match" : "Low match";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ - (circ * pct) / 100}
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums" style={{ color }}>{pct}%</span>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Diagram match</p>
          <p className="mt-0.5 text-base font-semibold text-slate-200">{label}</p>
          <p className="mt-1 text-xs text-slate-500">How closely this Terraform reflects your described architecture.</p>
        </div>
      </div>

      {advice.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            What's missing or could improve
          </p>
          <ul className="space-y-1.5">
            {advice.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs leading-snug text-slate-300">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/70" />
                <span className="break-words">{a}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">
            {pct < 100
              ? "These are gaps vs. common reference patterns — add them (or refine your description) to raise the match."
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconCpu = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
    <path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/>
  </svg>
);

const IconShield = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconLayers = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>
  </svg>
);

const IconFiles = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconAlert = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconStar = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Result() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initial = location.state || null;

  const [data, setData] = useState(initial);
  // Local working copy of the files so handoff actions (e.g. version pinning)
  // can update what the viewer/downloads show. Re-syncs when the generation changes.
  const [files, setFiles] = useState(() => initial?.files || {});
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackState, setFeedbackState] = useState("idle");
  // Export to another IaC format (CloudFormation YAML / AWS CDK TypeScript).
  const [exporting, setExporting] = useState(null); // "cloudformation" | "cdk" | null
  const [exportErr, setExportErr] = useState(null);
  const onExport = async (format) => {
    if (exporting) return;
    setExporting(format);
    setExportErr(null);
    try {
      const res = await exportGeneration(id, format);
      const blob = new Blob([res.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || (format === "cdk" ? "stack.ts" : "template.yaml");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e.message || "Export failed — try again.");
    } finally {
      setExporting(null);
    }
  };

  // Split the flat main.tf into per-concern files (network/compute/data/...).
  const [splitting, setSplitting] = useState(false);
  const [splitNote, setSplitNote] = useState(null);
  const onModularize = async () => {
    if (splitting) return;
    setSplitting(true);
    setExportErr(null);
    try {
      const res = await modularizeGeneration(id);
      setData(res.generation);
      setFiles(res.generation.files || {});
      setSplitNote((res.notes && res.notes[0]) || "Reorganized into per-concern files.");
    } catch (e) {
      setExportErr(e.message || "Split failed — try again.");
    } finally {
      setSplitting(false);
    }
  };

  // Inject consistent default_tags on the AWS provider.
  const [tagging, setTagging] = useState(false);
  const [tagNote, setTagNote] = useState(null);
  const onApplyTags = async () => {
    if (tagging) return;
    setTagging(true);
    setExportErr(null);
    try {
      const res = await applyStandardTags(id);
      setData(res.generation);
      setFiles(res.generation.files || {});
      setTagNote((res.notes && res.notes[0]) || "Standard tags applied.");
    } catch (e) {
      setExportErr(e.message || "Tagging failed — try again.");
    } finally {
      setTagging(false);
    }
  };

  useEffect(() => {
    // Navigated here with the result already in state (e.g. after a refine) —
    // sync it so the page reflects the new generation without a refetch.
    if (initial?.generation_id === id) {
      setData(initial);
      return;
    }
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
    return () => { cancel = true; };
  }, [id, initial]);

  // Keep the working file copy in sync with the loaded generation.
  useEffect(() => {
    setFiles(data?.files || {});
  }, [data]);

  const submitFeedback = async () => {
    if (!rating) {
      setFeedbackState("no-rating");
      return;
    }
    setFeedbackState("submitting");
    try {
      await postFeedback({ generationId: id, rating, comment, feedbackType: feedbackType || null });
      setFeedbackState("submitted");
    } catch (err) {
      setFeedbackState("error");
      setError(err.message || "Failed to submit feedback");
    }
  };

  // ── Computed metrics ──────────────────────────────────────────────────────

  const complexity = useMemo(
    () => getComplexityLabel(data?.resources_identified),
    [data?.resources_identified]
  );

  const avgConf = useMemo(
    () => avgConfidence(data?.confidence_scores),
    [data?.confidence_scores]
  );

  const confColor = (v) =>
    v == null ? "text-slate-500"
      : v >= 80 ? "text-emerald-300"
      : v >= 60 ? "text-amber-300"
      : "text-rose-300";

  const fileCount = Object.keys(data?.files || {}).length;
  const placeholderCount = data?.placeholders?.length ?? 0;
  const sessionHint = data ? getSessionId().slice(0, 8) : "";

  // ── Loading / error states ────────────────────────────────────────────────

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

  return (
    <main className="container-page min-w-0 space-y-6 py-6 sm:space-y-8 sm:py-10 md:py-14">

      {/* ── Page header ─────────────────────────────────────────────────── */}
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
          <p className="mt-1 text-sm text-slate-400">Generated {formatDate(data.created_at)}</p>
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

      {/* ── Project scaffold ─────────────────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <span className="block text-sm font-semibold text-slate-100">Project scaffold</span>

        <p className="mt-3 text-xs text-slate-400">
          Tag every resource consistently via the AWS provider's default_tags
          (Project / Environment / ManagedBy / CostCenter).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApplyTags}
            disabled={tagging}
            className="rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-1.5 text-xs text-brand-100 hover:bg-brand-400/20 disabled:opacity-50"
          >
            {tagging ? "Applying…" : "Apply standard tags"}
          </button>
          {tagNote && <span className="text-xs text-emerald-300/90">{tagNote}</span>}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Download a ready-to-push repo: all .tf files plus a README, .gitignore,
          example tfvars, and a GitHub Actions workflow (fmt / init / validate).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={scaffoldDownloadUrl(id, "bundle")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            Download repo (.zip)
          </a>
          <a
            href={scaffoldDownloadUrl(id, "readme")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            README.md
          </a>
          <a
            href={scaffoldDownloadUrl(id, "ci")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            CI workflow (.yml)
          </a>
        </div>
      </section>

      {/* ── Organize & export ────────────────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <span className="block text-sm font-semibold text-slate-100">Organize & export</span>

        <p className="mt-3 text-xs text-slate-400">
          Reorganize the flat main.tf into per-concern files (network / compute / data / …).
          Everything stays in one root module, so the plan is unchanged — it's purely for readability.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onModularize}
            disabled={splitting}
            className="rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-1.5 text-xs text-brand-100 hover:bg-brand-400/20 disabled:opacity-50"
          >
            {splitting ? "Splitting…" : "Split into files by concern"}
          </button>
          {splitNote && <span className="text-xs text-emerald-300/90">{splitNote}</span>}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Or download the same infrastructure in another IaC format.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onExport("cloudformation")}
            disabled={!!exporting}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {exporting === "cloudformation" ? "Converting…" : "CloudFormation (YAML)"}
          </button>
          <button
            type="button"
            onClick={() => onExport("cdk")}
            disabled={!!exporting}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {exporting === "cdk" ? "Converting…" : "AWS CDK (TypeScript)"}
          </button>
        </div>
        {exportErr && <p className="mt-2 text-xs text-rose-300">{exportErr}</p>}
      </section>

      {/* ── Dashboard KPI stat cards ─────────────────────────────────────── */}
      <div data-tour="result-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Match Score */}
        <StatCard
          label="Match Score"
          value={`${data.diagram_match_percent ?? 0}%`}
          sub="diagram accuracy"
          icon={IconStar}
          valueColor={
            (data.diagram_match_percent ?? 0) >= 80 ? "text-emerald-300"
              : (data.diagram_match_percent ?? 0) >= 60 ? "text-amber-300"
              : "text-rose-300"
          }
          accent="brand"
        />

        {/* Resources */}
        <StatCard
          label="Resources"
          value={data.resources_identified?.length ?? 0}
          sub="identified"
          icon={IconCpu}
          accent="violet"
        />

        {/* Files */}
        <StatCard
          label="Files"
          value={fileCount}
          sub="Terraform files"
          icon={IconFiles}
        />

        {/* Avg Confidence */}
        <StatCard
          label="Avg Confidence"
          value={avgConf != null ? `${avgConf}%` : "—"}
          sub="across files"
          icon={IconShield}
          valueColor={confColor(avgConf)}
        />

        {/* Complexity */}
        <StatCard
          label="Complexity"
          value={complexity.label}
          sub={`${data.resources_identified?.length ?? 0} resources`}
          icon={IconLayers}
          valueColor={complexity.color}
        />

        {/* Placeholders */}
        <StatCard
          label="Placeholders"
          value={placeholderCount}
          sub={placeholderCount > 0 ? "need review" : "none needed"}
          icon={IconAlert}
          valueColor={placeholderCount > 0 ? "text-amber-300" : "text-emerald-300"}
          accent={placeholderCount > 0 ? "amber" : undefined}
        />
      </div>

      {/* ── Token Usage Card ─────────────────────────────────────────────── */}
      {data.token_usage && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400" aria-hidden>
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Token Usage</span>
          <div className="flex flex-wrap gap-4 ml-1">
            <span className="text-xs text-slate-400">
              Prompt: <span className="font-semibold text-slate-200">{data.token_usage.prompt_tokens.toLocaleString()}</span>
            </span>
            <span className="text-xs text-slate-400">
              Completion: <span className="font-semibold text-slate-200">{data.token_usage.completion_tokens.toLocaleString()}</span>
            </span>
            <span className="text-xs text-slate-400">
              Total: <span className="font-bold text-violet-300">{data.token_usage.total_tokens.toLocaleString()}</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Warning banner ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-400" aria-hidden>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-200">Starter template — not production-ready</p>
          <p className="mt-0.5 text-xs text-amber-300/70">
            This Terraform is ~60–70% complete. Search for{" "}
            <code className="rounded bg-amber-400/10 px-1 font-mono text-amber-300">&lt;REPLACE_*&gt;</code>{" "}
            placeholders and review all{" "}
            <code className="rounded bg-amber-400/10 px-1 font-mono text-amber-300"># TODO</code>{" "}
            comments before deploying.
            {placeholderCount > 0 && (
              <span className="ml-1 font-medium text-amber-300">
                {placeholderCount} placeholder{placeholderCount !== 1 ? "s" : ""} found.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Deploy to AWS — full width, primary action ───────────────────── */}
      <DeployPanel data={data} />

      {/* ── Dashboard main grid ──────────────────────────────────────────── */}
      <div className="grid min-w-0 gap-6 lg:gap-8 xl:grid-cols-[minmax(0,320px),minmax(0,1fr)] xl:items-start">

        {/* Left sidebar — tools & insights ─────────────────────────────── */}
        <aside data-tour="result-tools" className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">

          {/* Hand off — copy for AI, README, version pinning */}
          <HandoffPanel data={data} files={files} onApplyFiles={setFiles} />

          {/* Match Score Ring */}
          <MatchScoreWidget
            percent={data.diagram_match_percent ?? 0}
            advice={data.improvement_advice || []}
          />

          {/* Confidence scores */}
          {data.confidence_scores && Object.keys(data.confidence_scores).length > 0 && (
            <ConfidenceScores scores={data.confidence_scores} />
          )}

          {/* Security */}
          <SecurityScorePanel
            files={data.files || {}}
            securityWarnings={data.security_warnings || []}
          />

          {/* Static lint (always available; no terraform CLI needed) */}
          <LintPanel findings={data.lint_findings || []} />

          {/* Insights */}
          <InsightsDeck
            improvementAdvice={data.improvement_advice || []}
            securityWarnings={data.security_warnings || []}
            terraformValidation={data.terraform_validation}
          />

          {/* Cost */}
          <CostBreakdown
            files={data.files || {}}
            resources={data.resources_identified || []}
            cloudProvider={data.cloud_provider}
          />
          <CostOptimizer
            files={data.files || {}}
            resources={data.resources_identified || []}
            cloudProvider={data.cloud_provider}
            environment={data.environment}
          />

          {/* Compliance */}
          <ComplianceChecker files={data.files || {}} />

          {/* Tfvars */}
          <TfvarsGenerator files={data.files || {}} />

          {/* Architecture diagram */}
          <MermaidExport resources={data.resources_identified || []} files={data.files || {}} />

          {/* File diff */}
          <FileDiffSummary summary={data.file_diff_summary} />

          {/* Share */}
          <ShareAndGitCard
            generationId={data.generation_id}
            requestId={data.request_id}
            apiBase={getApiBaseUrl()}
          />
        </aside>

        {/* Right main content ───────────────────────────────────────────── */}
        <div className="space-y-6 min-w-0">

          {/* Resources identified */}
          <section className="card p-5 sm:p-6">
            <SectionHeader
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
              title="Resources Identified"
              subtitle={`${data.resources_identified?.length ?? 0} cloud resources mapped from your description`}
            />
            <ResourceMap resources={data.resources_identified || []} />
          </section>

          {/* Assumptions & usage */}
          <AssumptionsBox
            assumptions={data.assumptions}
            usageInstructions={data.usage_instructions}
          />

          {/* Terraform code */}
          <section data-tour="result-code">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <SectionHeader
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
                title="Terraform Output"
                subtitle={`${fileCount} file${fileCount !== 1 ? "s" : ""} generated`}
              />
              {fileCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadZip(
                        { ...files, "README.md": buildReadme(data, files) },
                        "terrasketch.zip"
                      )
                    }
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    Download .zip
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadZip(
                        buildModuleFiles(files, `${data.cloud_provider}_${data.environment}`),
                        "terrasketch-module.zip"
                      )
                    }
                    title="Repackage as a reusable Terraform module (modules/ + root caller)"
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    Download as module
                  </button>
                </div>
              )}
            </div>
            <CodeViewer files={files} />
          </section>

          {/* ── Code Explanation (NEW) ──────────────────────────────────── */}
          {fileCount > 0 && (
            <TerraformExplainer files={data.files || {}} />
          )}

          {/* Feedback */}
          <section className="card p-5 sm:p-6">
            <SectionHeader
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
              title="Was this useful?"
              subtitle="Your rating helps tune future generations"
            />
            {feedbackState === "submitted" ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-emerald-400">
                  <path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <p className="text-sm text-emerald-300">Thanks for your feedback — it's been recorded!</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <StarRating value={rating} onChange={(v) => { setRating(v); if (feedbackState === "no-rating") setFeedbackState("idle"); }} />
                  {feedbackState === "no-rating" && (
                    <p className="mt-1.5 text-xs text-amber-400">Please select a star rating before submitting.</p>
                  )}
                </div>
                <select
                  className="input text-sm"
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value)}
                >
                  <option value="">Category (optional)</option>
                  <option value="accuracy">Accuracy — resources don't match my design</option>
                  <option value="quality">Code quality — syntax or logic issues</option>
                  <option value="security">Security — warnings or findings</option>
                  <option value="cost">Cost — recommendations</option>
                  <option value="compliance">Compliance — checker results</option>
                  <option value="general">General feedback</option>
                </select>
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
                    disabled={feedbackState === "submitting"}
                  >
                    {feedbackState === "submitting" ? "Sending…" : "Submit feedback"}
                  </Button>
                  {feedbackState === "error" && (
                    <span className="text-xs text-rose-300">Couldn't submit — please try again.</span>
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
