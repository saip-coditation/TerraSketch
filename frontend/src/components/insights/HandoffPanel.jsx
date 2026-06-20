import React, { useState } from "react";
import { buildAiBundle, buildReadme, pinProviderVersions, providerMeta } from "../../utils/handoff.js";
import { copyToClipboard, downloadTextFile } from "../../utils/downloadZip.js";

/**
 * HandoffPanel — make the generated draft ready to hand off:
 *   • Copy for AI tools (prompt-ready bundle)
 *   • Download a generated README.md
 *   • Pin Terraform + provider versions into providers.tf
 *
 * `onApplyFiles` lets version pinning update the files used by the code viewer
 * and downloads on the result page.
 */
export default function HandoffPanel({ data, files, onApplyFiles }) {
  const meta = providerMeta(data?.cloud_provider);
  const [copied, setCopied] = useState(false);
  const [tfVersion, setTfVersion] = useState(">= 1.5.0");
  const [provVersion, setProvVersion] = useState(meta.defaultVersion);
  const [pinned, setPinned] = useState(false);

  const copyForAi = async () => {
    try {
      await copyToClipboard(buildAiBundle(data, files));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const downloadReadme = () => downloadTextFile("README.md", buildReadme(data, files));

  const applyPin = () => {
    const updated = {
      ...files,
      "providers.tf": pinProviderVersions(files["providers.tf"] || "", {
        provider: data?.cloud_provider,
        terraformVersion: tfVersion.trim() || ">= 1.5.0",
        providerVersion: provVersion.trim() || meta.defaultVersion,
      }),
    };
    onApplyFiles?.(updated);
    setPinned(true);
    setTimeout(() => setPinned(false), 2500);
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-100">Hand off</p>
          <p className="text-xs text-slate-400">Take this draft into your editor or AI tool.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={copyForAi}
          className="btn-primary w-full justify-center py-2.5 text-sm"
        >
          {copied ? (
            "Copied — paste into your AI tool"
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy for AI tools
            </>
          )}
        </button>
        <button
          type="button"
          onClick={downloadReadme}
          className="btn-secondary w-full justify-center py-2 text-xs"
        >
          Download README.md
        </button>
      </div>

      {/* Provider version pinning */}
      <div className="mt-4 border-t border-white/5 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Pin versions ({meta.label})
        </p>
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">Terraform version</span>
            <input
              className="input w-full py-1.5 text-xs"
              value={tfVersion}
              onChange={(e) => setTfVersion(e.target.value)}
              placeholder=">= 1.5.0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">
              Provider version ({meta.name})
            </span>
            <input
              className="input w-full py-1.5 text-xs"
              value={provVersion}
              onChange={(e) => setProvVersion(e.target.value)}
              placeholder={meta.defaultVersion}
            />
          </label>
          <button
            type="button"
            onClick={applyPin}
            className="btn-secondary w-full justify-center py-2 text-xs"
          >
            {pinned ? "Applied to providers.tf ✓" : "Apply to providers.tf"}
          </button>
        </div>
      </div>
    </div>
  );
}
