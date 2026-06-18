import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { refineGeneration } from "../../services/api.js";

/**
 * RefinePanel — iterate on an existing generation without starting over.
 *
 * Edits the actual generated Terraform files (via /api/refine) and compares the
 * result against the current generation so the new result shows a file-level
 * diff. Works for any generation — text or diagram/import. Security/compliance
 * findings become one-click "fix" actions.
 */
export default function RefinePanel({ data }) {
  const navigate = useNavigate();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const quickFixes = (data?.security_warnings || []).slice(0, 5);

  const runRefine = async (rawNote) => {
    const note = (rawNote ?? instruction).trim();
    if (!note || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await refineGeneration(data.generation_id, note);
      setInstruction("");
      navigate(`/result/${result.generation_id}`, { state: result });
    } catch (e) {
      setError(e.message || "Refine failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-100">Refine this design</p>
          <p className="text-xs text-slate-400">Describe a change — we regenerate and show a diff.</p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
          <textarea
            className="textarea min-h-[72px] text-sm"
            placeholder="e.g. add a Redis cache between the app and database, make the RDS multi-AZ, add CloudWatch alarms…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
          />

          <button
            type="button"
            onClick={() => runRefine()}
            disabled={busy || !instruction.trim()}
            className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? "Refining… regenerating with your change" : "Refine"}
          </button>

          {quickFixes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                One-click fixes
              </p>
              <div className="flex flex-col gap-1.5">
                {quickFixes.map((w, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runRefine(
                        `Fix this security/compliance finding while keeping the rest of the architecture intact: ${w}`
                      )
                    }
                    className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 px-2.5 py-1.5 text-left text-xs text-amber-200/90 transition hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
                      <path d="M14.7 6.3a4 4 0 0 0-5.6 5.6l-6.4 6.4a2 2 0 0 0 2.8 2.8l6.4-6.4a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.1-2.1Z" />
                    </svg>
                    <span className="line-clamp-2">Fix: {w}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
    </div>
  );
}
