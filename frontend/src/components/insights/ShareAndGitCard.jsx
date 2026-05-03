import React, { useState } from "react";
import Button from "../shared/Button.jsx";
import { copyToClipboard } from "../../utils/downloadZip.js";

export default function ShareAndGitCard({ generationId, requestId, apiBase }) {
  const [copied, setCopied] = useState(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const resultUrl = `${origin}/result/${generationId}`;

  const copy = async (key, text) => {
    try {
      await copyToClipboard(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied("err");
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Share & trace
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Copy a link to this result or the request id for support logs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            type="button"
            className="text-xs"
            onClick={() => copy("link", resultUrl)}
          >
            {copied === "link" ? "Copied URL" : "Copy result link"}
          </Button>
          {requestId && (
            <Button
              variant="ghost"
              type="button"
              className="text-xs"
              onClick={() => copy("rid", requestId)}
            >
              {copied === "rid" ? "Copied ID" : "Copy request ID"}
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Ship to GitHub
        </h3>
        <ol className="mt-2 list-inside list-decimal space-y-1.5 text-xs leading-relaxed text-slate-400 marker:text-brand-400">
          <li>
            Save files locally, then{" "}
            <code className="break-all rounded bg-black/30 px-1 font-mono text-[11px] text-slate-300">
              git init
            </code>{" "}
            in that folder.
          </li>
          <li>
            Add remote:{" "}
            <code className="rounded bg-black/30 px-1 font-mono text-[11px] text-slate-300">
              git remote add origin &lt;your-repo-url&gt;
            </code>
          </li>
          <li>
            Commit and push{" "}
            <code className="break-all rounded bg-black/30 px-1 font-mono text-[11px] text-slate-300">
              main
            </code>
            . If push is rejected, run{" "}
            <code className="break-all rounded bg-black/30 px-1 font-mono text-[11px] text-slate-300">
              git pull --rebase
            </code>{" "}
            first.
          </li>
        </ol>
        {apiBase && (
          <p className="mt-2 text-[11px] text-slate-500">
            API:{" "}
            <span className="break-all font-mono text-slate-400">{apiBase}</span>
          </p>
        )}
      </div>
    </div>
  );
}
