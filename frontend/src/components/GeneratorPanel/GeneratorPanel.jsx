import React, { useEffect, useState } from "react";
import ProviderSelector from "./ProviderSelector.jsx";
import UploadZone from "./UploadZone.jsx";
import ImportZone from "./ImportZone.jsx";
import Button from "../shared/Button.jsx";
import LoadingSpinner from "../shared/LoadingSpinner.jsx";
import { useVoiceToText } from "../../hooks/useVoiceToText.js";

const ENVIRONMENTS = [
  { id: "dev", label: "Dev" },
  { id: "staging", label: "Staging" },
  { id: "production", label: "Production" },
];

const TABS = [
  { id: "image", label: "Upload Diagram" },
  { id: "text", label: "Describe in Text" },
  { id: "drawio", label: "Import File" },
];

const PRESETS = [
  { id: "auto", label: "Auto", description: "Infer everything from your input" },
  { id: "simple_web", label: "Simple web", description: "VPC · ALB · EC2 · RDS" },
  { id: "microservice", label: "Microservice", description: "CloudFront · ECS · data tier" },
  { id: "serverless", label: "Serverless", description: "API GW · Lambda · DynamoDB/S3" },
];

const SCALE_TIERS = [
  {
    id: "small",
    label: "Small",
    range: "0–100 users",
    color: "emerald",
    hint: "t3.small/micro • single-AZ • backup restore DR",
  },
  {
    id: "mid",
    label: "Mid",
    range: "100–1K users",
    color: "brand",
    hint: "m5.large • Multi-AZ • 15 min RPO",
  },
  {
    id: "high",
    label: "High",
    range: "1K+ users",
    color: "violet",
    hint: "r5/c5 • multi-region • <1 min RPO",
  },
];

export default function GeneratorPanel({ onSubmit, loading, prefill = null }) {
  const [provider, setProvider] = useState(prefill?.provider || "aws");
  const [environment, setEnvironment] = useState(prefill?.environment || "dev");
  const [architecturePreset, setArchitecturePreset] = useState("auto");
  const [tab, setTab] = useState(prefill?.inputType === "text" || prefill?.text ? "text" : "image");
  const [file, setFile] = useState(null);
  const [text, setText] = useState(prefill?.text || "");
  const [importData, setImportData] = useState(null); // parsed draw.io / excalidraw result
  const [correctionNote, setCorrectionNote] = useState("");
  const [compareGenerationId, setCompareGenerationId] = useState(() =>
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("terrasketch_last_generation_id") || ""
      : ""
  );
  const [scaleTier, setScaleTier] = useState("small");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState(null);
  const voice = useVoiceToText(setText);

  useEffect(() => {
    if (tab !== "text") {
      voice.stop();
      voice.setHint(null);
    }
  }, [tab, voice.stop, voice.setHint]);

  // Auto-select provider when draw.io/excalidraw detects one
  const handleImportParsed = (parsed) => {
    setImportData(parsed);
    if (parsed?.provider) setProvider(parsed.provider);
  };

  const isImageOnlyFile = file?.type?.startsWith("image/");
  const canSubmit =
    !loading &&
    ((tab === "image" && isImageOnlyFile) ||
     (tab === "text" && text.trim().length > 0) ||
     (tab === "drawio" && importData != null));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const base = {
        cloud_provider: provider,
        environment,
        architecture_preset: architecturePreset,
        scale_tier: scaleTier,
        correction_note: correctionNote.trim() || null,
        compare_generation_id: compareGenerationId.trim() || null,
      };
      if (tab === "image") {
        if (!file) throw new Error("Please upload a diagram first");
        if (!isImageOnlyFile) {
          throw new Error("Please upload a PNG, JPG, WEBP, or GIF image. For .drawio or .excalidraw files use the Import File tab.");
        }
        await onSubmit({
          ...base,
          input_type: "image",
          image_base64: file.dataUrl,
          text_description: null,
        });
      } else if (tab === "drawio") {
        if (!importData) throw new Error("Please import a diagram file first");
        await onSubmit({
          ...base,
          input_type: "text",
          image_base64: null,
          text_description: importData.description,
        });
      } else {
        if (!text.trim()) throw new Error("Please describe your architecture");
        await onSubmit({
          ...base,
          input_type: "text",
          image_base64: null,
          text_description: text.trim(),
        });
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card-glow min-w-0 space-y-5 p-4 sm:space-y-6 sm:p-8">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Cloud Provider
        </label>
        <ProviderSelector value={provider} onChange={setProvider} />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Architecture preset
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setArchitecturePreset(p.id)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                architecturePreset === p.id
                  ? "border-brand-400/50 bg-brand-500/15 text-white shadow-glow"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
              }`}
            >
              <span className="font-semibold text-slate-100">{p.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Environment
        </label>
        <div className="-mx-1 flex max-w-full snap-x snap-mandatory gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1 sm:inline-flex sm:overflow-visible">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => setEnvironment(env.id)}
              className={`shrink-0 snap-center rounded-lg px-4 py-2.5 text-sm transition sm:px-3 sm:py-1.5 ${
                environment === env.id
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {env.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scale tier selector */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Scale tier
          <span className="ml-2 text-xs font-normal text-slate-500">sizes instances, replication &amp; DR strategy</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SCALE_TIERS.map((s) => {
            const active = scaleTier === s.id;
            const ring = {
              emerald: active ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_16px_rgba(52,211,153,0.15)]" : "border-white/10 bg-white/[0.03] hover:border-emerald-400/20 hover:bg-emerald-500/5",
              brand:   active ? "border-brand-400/50 bg-brand-500/10 shadow-glow" : "border-white/10 bg-white/[0.03] hover:border-brand-400/20 hover:bg-brand-500/5",
              violet:  active ? "border-violet-400/50 bg-violet-500/10 shadow-[0_0_16px_rgba(167,139,250,0.15)]" : "border-white/10 bg-white/[0.03] hover:border-violet-400/20 hover:bg-violet-500/5",
            }[s.color];
            const dot = { emerald: "bg-emerald-400", brand: "bg-brand-400", violet: "bg-violet-400" }[s.color];
            const text = { emerald: "text-emerald-300", brand: "text-brand-300", violet: "text-violet-300" }[s.color];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScaleTier(s.id)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${ring}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${active ? dot : "bg-slate-600"}`} />
                  <span className={`font-semibold ${active ? text : "text-slate-200"}`}>{s.label}</span>
                </div>
                <span className="mt-0.5 block text-[11px] text-slate-500">{s.range}</span>
                {active && <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{s.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex min-w-0 items-stretch gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); }}
              className={`min-h-[44px] flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium leading-snug transition sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm ${
                tab === t.id ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "drawio" ? (
          <ImportZone
            onParsed={handleImportParsed}
            onError={(msg) => setError(msg || null)}
          />
        ) : tab === "image" ? (
          <UploadZone
            value={file}
            onChange={setFile}
            onError={(msg) => setError(msg)}
          />
        ) : (
          <div className="relative">
            <textarea
              className="textarea min-h-[200px] pr-[3.25rem] pb-14 font-mono text-base leading-relaxed sm:min-h-[180px] sm:pb-12 sm:text-sm"
              placeholder={
                "e.g., A 3-tier web app on AWS with an ALB in front of two EC2 instances in private subnets, " +
                "an RDS Postgres database in another private subnet, and an S3 bucket for static assets fronted by CloudFront."
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Architecture description"
            />
            <button
              type="button"
              onClick={() => {
                setError(null);
                voice.toggle();
              }}
              disabled={!voice.supported}
              title={
                voice.supported
                  ? voice.listening
                    ? "Stop voice input"
                    : "Start voice input (microphone)"
                  : "Voice input is not supported in this browser"
              }
              className={`absolute bottom-2 right-2 grid h-11 w-11 place-items-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-brand-400/50 sm:bottom-3 sm:right-3 sm:h-10 sm:w-10 ${
                voice.listening
                  ? "border-rose-400/50 bg-rose-500/20 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                  : voice.supported
                    ? "border-white/15 bg-white/10 text-brand-200 hover:border-brand-400/40 hover:bg-brand-500/15"
                    : "cursor-not-allowed border-white/5 bg-white/5 text-slate-600"
              }`}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
            >
              {voice.listening ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 19v3M8 22h8M12 15a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v5a4 4 0 0 0 4 4Z" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                </svg>
              )}
            </button>
            {voice.hint && (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{voice.hint}</p>
            )}
            {voice.supported && (
              <p className="mt-1 text-[11px] text-slate-600">
                Tip: use Chrome on Android; speak in short phrases if results lag. Tap mic again to
                stop.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.06]"
        >
          <span className="pr-2 text-left font-medium leading-snug">
            Advanced — refinements &amp; compare
          </span>
          <span className="text-slate-500">{advancedOpen ? "−" : "+"}</span>
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-3 rounded-xl border border-white/5 bg-ink-900/40 p-4">
            <div>
              <label className="text-xs font-medium text-slate-400">
                Correction / extra instructions
              </label>
              <textarea
                className="textarea mt-1.5 min-h-[88px] text-sm"
                placeholder="e.g., Add NAT gateways, use HTTPS-only on the ALB, pin provider 5.x…"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">
                Compare to previous generation ID (optional)
              </label>
              <input
                className="input mt-1.5 break-all font-mono text-xs"
                placeholder="uuid from History — line-level summary after generate"
                value={compareGenerationId}
                onChange={(e) => setCompareGenerationId(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Pre-filled from your last run on this browser when available.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Generation uses your configured LLM (Azure, Claude, Gemini, or mock). Typical wait 10–40s.
        </p>
        <Button type="submit" disabled={!canSubmit} className="w-full py-3.5 sm:w-auto sm:min-w-[200px] sm:py-2">
          {loading ? (
            <>
              <LoadingSpinner /> Generating…
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m9 11 3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Generate Terraform
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
