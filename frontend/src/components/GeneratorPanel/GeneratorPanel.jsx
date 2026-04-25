import React, { useState } from "react";
import ProviderSelector from "./ProviderSelector.jsx";
import UploadZone from "./UploadZone.jsx";
import Button from "../shared/Button.jsx";
import LoadingSpinner from "../shared/LoadingSpinner.jsx";

const ENVIRONMENTS = [
  { id: "dev", label: "Dev" },
  { id: "staging", label: "Staging" },
  { id: "production", label: "Production" },
];

const TABS = [
  { id: "image", label: "Upload Diagram" },
  { id: "text", label: "Describe in Text" },
];

export default function GeneratorPanel({ onSubmit, loading }) {
  const [provider, setProvider] = useState("aws");
  const [environment, setEnvironment] = useState("dev");
  const [tab, setTab] = useState("image");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  const isImageOnlyFile = file?.type?.startsWith("image/");
  const canSubmit =
    !loading &&
    ((tab === "image" && isImageOnlyFile) ||
      (tab === "text" && text.trim().length > 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (tab === "image") {
        if (!file) throw new Error("Please upload a diagram first");
        if (!isImageOnlyFile) {
          throw new Error(
            "PDF and draw.io support is coming soon — for now, please upload a PNG/JPG screenshot of your diagram."
          );
        }
        await onSubmit({
          cloud_provider: provider,
          environment,
          input_type: "image",
          image_base64: file.dataUrl,
          text_description: null,
        });
      } else {
        if (!text.trim()) throw new Error("Please describe your architecture");
        await onSubmit({
          cloud_provider: provider,
          environment,
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
    <form onSubmit={handleSubmit} className="card p-6 sm:p-8 space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Cloud Provider
        </label>
        <ProviderSelector value={provider} onChange={setProvider} />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Environment
        </label>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => setEnvironment(env.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
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

      <div>
        <div className="mb-3 flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "image" ? (
          <UploadZone
            value={file}
            onChange={setFile}
            onError={(msg) => setError(msg)}
          />
        ) : (
          <textarea
            className="textarea min-h-[180px] font-mono text-sm leading-relaxed"
            placeholder={
              "e.g., A 3-tier web app on AWS with an ALB in front of two EC2 instances in private subnets, " +
              "an RDS Postgres database in another private subnet, and an S3 bucket for static assets fronted by CloudFront."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
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
          Generation runs Claude with vision. It usually takes 10–25 seconds.
        </p>
        <Button type="submit" disabled={!canSubmit} className="sm:min-w-[180px]">
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
