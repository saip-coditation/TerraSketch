import React, { useEffect, useRef, useState } from "react";
import { startDeploy, getDeploy, destroyDeploy } from "../../services/api.js";

/**
 * DeployPanel — apply / destroy a generation to the user's own AWS account.
 *
 * The user enters transient AWS keys (used once, never stored). The backend
 * queues a job; a Terraform worker runs it and streams logs back, which we poll.
 */

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-central-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
];

const TERMINAL = ["destroyed", "error"];

function StatusBadge({ status }) {
  const map = {
    queued: ["bg-amber-400/15 text-amber-300", "Queued"],
    running: ["bg-brand-400/15 text-brand-300", "Running"],
    applied: ["bg-emerald-400/15 text-emerald-300", "Applied"],
    destroyed: ["bg-slate-400/15 text-slate-300", "Destroyed"],
    error: ["bg-rose-400/15 text-rose-300", "Error"],
  };
  const [cls, label] = map[status] || ["bg-slate-400/15 text-slate-300", status || "—"];
  const live = status === "queued" || status === "running";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  );
}

export default function DeployPanel({ data }) {
  const [mode, setMode] = useState("collapsed"); // collapsed | deploy-form | active | destroy-form
  const [region, setRegion] = useState("us-east-1");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [deploymentId, setDeploymentId] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState("");
  const [outputs, setOutputs] = useState({});

  const logRef = useRef(null);

  // Poll while a job is in flight.
  useEffect(() => {
    if (!deploymentId) return;
    if (status && TERMINAL.includes(status)) return;
    let cancel = false;
    const tick = async () => {
      try {
        const d = await getDeploy(deploymentId);
        if (cancel) return;
        setStatus(d.status);
        setLogs(d.logs || "");
        setOutputs(d.outputs || {});
        if (d.error) setError(d.error);
      } catch {
        /* keep polling */
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => { cancel = true; clearInterval(iv); };
  }, [deploymentId, status]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const wipeKeys = () => { setAccessKey(""); setSecretKey(""); };

  const onDeploy = async () => {
    if (!accessKey.trim() || !secretKey.trim()) {
      setError("Enter both AWS keys.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { deployment_id } = await startDeploy({
        generation_id: data.generation_id,
        region,
        aws_access_key_id: accessKey.trim(),
        aws_secret_access_key: secretKey.trim(),
      });
      wipeKeys();
      setDeploymentId(deployment_id);
      setStatus("queued");
      setLogs("");
      setMode("active");
    } catch (e) {
      setError(e.message || "Deploy failed to start");
    } finally {
      setBusy(false);
    }
  };

  const onDestroy = async () => {
    if (confirmText !== "DESTROY") {
      setError('Type DESTROY to confirm.');
      return;
    }
    if (!accessKey.trim() || !secretKey.trim()) {
      setError("Re-enter both AWS keys to destroy.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await destroyDeploy(deploymentId, {
        aws_access_key_id: accessKey.trim(),
        aws_secret_access_key: secretKey.trim(),
        confirm: true,
      });
      wipeKeys();
      setConfirmText("");
      setStatus("queued");
      setMode("active");
    } catch (e) {
      setError(e.message || "Destroy failed to start");
    } finally {
      setBusy(false);
    }
  };

  const Warning = (
    <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200/90">
      ⚠️ This creates <b>real AWS resources</b> in the account these keys belong to — you will be
      billed for them. Keys are used once, in memory, and never stored.
    </p>
  );

  const KeyInputs = (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">Region</span>
        <select className="input w-full py-2 text-sm" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">AWS Access Key ID</span>
        <input className="input w-full py-2 text-sm font-mono" value={accessKey} autoComplete="off"
          onChange={(e) => setAccessKey(e.target.value)} placeholder="AKIA…" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">AWS Secret Access Key</span>
        <input className="input w-full py-2 text-sm font-mono" type="password" value={secretKey} autoComplete="off"
          onChange={(e) => setSecretKey(e.target.value)} placeholder="••••••••" />
      </label>
    </div>
  );

  return (
    <div className="card-glow p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-500/20 text-orange-300 ring-1 ring-orange-400/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10" /><path d="m8 12 3 3 5-6" />
            </svg>
          </span>
          <div>
            <p className="text-lg font-bold text-white">Deploy to AWS</p>
            <p className="text-sm text-slate-400">Create or destroy this infrastructure on your AWS account.</p>
          </div>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

      {/* Collapsed */}
      {mode === "collapsed" && (
        <div className="mt-4 space-y-3">
          {Warning}
          <button type="button" onClick={() => { setError(null); setMode("deploy-form"); }}
            className="btn-primary w-full justify-center py-3 text-sm sm:w-auto sm:px-8">
            Deploy to AWS
          </button>
        </div>
      )}

      {/* Deploy form */}
      {mode === "deploy-form" && (
        <div className="mt-4 space-y-3">
          {Warning}
          {KeyInputs}
          <div className="flex gap-2">
            <button type="button" onClick={onDeploy} disabled={busy}
              className="btn-primary justify-center py-2.5 px-6 text-sm disabled:opacity-60">
              {busy ? "Starting…" : "Terraform apply"}
            </button>
            <button type="button" onClick={() => { wipeKeys(); setMode("collapsed"); setError(null); }}
              className="btn-secondary justify-center py-2.5 px-4 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active — live logs */}
      {mode === "active" && (
        <div className="mt-4 space-y-3">
          <pre ref={logRef} className="max-h-[28rem] min-h-[12rem] overflow-auto rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
            {logs || "Waiting for the worker to pick up the job…"}
          </pre>

          {status === "applied" && Object.keys(outputs).length > 0 && (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Outputs</p>
              {Object.entries(outputs).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 text-[11px]">
                  <span className="font-mono text-slate-400">{k}</span>
                  <span className="truncate font-mono text-slate-200">{String(v?.value ?? v)}</span>
                </div>
              ))}
            </div>
          )}

          {status === "error" && (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-xs text-rose-200/90">
              This deployment ended with an error. If any resources were created, use <b>Destroy</b> to clean them up.
            </p>
          )}
          {(status === "applied" || status === "error") && (
            <button type="button" onClick={() => { setError(null); setMode("destroy-form"); }}
              className="btn-secondary w-full justify-center py-2 text-xs text-rose-200">
              Destroy this deployment
            </button>
          )}
          {TERMINAL.includes(status) && (
            <button type="button" onClick={() => { setMode("collapsed"); setDeploymentId(null); setStatus(null); setLogs(""); setOutputs({}); }}
              className="btn-secondary w-full justify-center py-2 text-xs">
              Done
            </button>
          )}
        </div>
      )}

      {/* Destroy confirm */}
      {mode === "destroy-form" && (
        <div className="mt-3 space-y-2.5">
          <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-[11px] leading-snug text-rose-200/90">
            This will <b>permanently destroy</b> the deployed resources. Re-enter your keys and type
            <b> DESTROY</b> to confirm.
          </p>
          {KeyInputs}
          <input className="input w-full py-1.5 text-xs font-mono" value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DESTROY" />
          <div className="flex gap-2">
            <button type="button" onClick={onDestroy} disabled={busy}
              className="btn-primary flex-1 justify-center bg-gradient-to-r from-rose-500 to-rose-600 py-2 text-xs disabled:opacity-60">
              {busy ? "Starting…" : "Terraform destroy"}
            </button>
            <button type="button" onClick={() => { wipeKeys(); setConfirmText(""); setMode("active"); setError(null); }}
              className="btn-secondary justify-center py-2 px-3 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
