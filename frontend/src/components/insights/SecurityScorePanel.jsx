import React, { useMemo, useState } from "react";

// ── Security checks run against generated HCL text ──────────────────────────

const CHECKS = [
  // ── IAM / Identity ──────────────────────────────────────────────────────
  {
    id: "iam_wildcard_action",
    severity: "critical",
    category: "IAM",
    title: "Wildcard IAM action",
    detail: 'actions = ["*"] grants every AWS API call. Restrict to the minimum required.',
    test: (hcl) => /actions\s*=\s*\[.*"\*".*\]/i.test(hcl) || /effect\s*=\s*"Allow"[\s\S]{0,200}"\*"/i.test(hcl),
  },
  {
    id: "iam_wildcard_resource",
    severity: "high",
    category: "IAM",
    title: "Wildcard IAM resource",
    detail: 'resources = ["*"] is overly broad. Scope to specific ARNs where possible.',
    test: (hcl) => /resources\s*=\s*\[.*"\*".*\]/i.test(hcl),
  },
  // ── Encryption ──────────────────────────────────────────────────────────
  {
    id: "rds_not_encrypted",
    severity: "critical",
    category: "Encryption",
    title: "RDS storage not encrypted",
    detail: 'aws_db_instance without storage_encrypted = true stores data in plaintext.',
    test: (hcl) =>
      /resource\s+"aws_db_instance"/.test(hcl) &&
      !/storage_encrypted\s*=\s*true/i.test(hcl),
  },
  {
    id: "ebs_not_encrypted",
    severity: "high",
    category: "Encryption",
    title: "EBS volume not encrypted",
    detail: 'aws_ebs_volume without encrypted = true leaves disk data unencrypted.',
    test: (hcl) =>
      /resource\s+"aws_ebs_volume"/.test(hcl) &&
      !/encrypted\s*=\s*true/i.test(hcl),
  },
  {
    id: "s3_no_sse",
    severity: "high",
    category: "Encryption",
    title: "S3 bucket without server-side encryption",
    detail: "Add aws_s3_bucket_server_side_encryption_configuration to encrypt objects at rest.",
    test: (hcl) =>
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/server_side_encryption_configuration|aws_s3_bucket_server_side_encryption/i.test(hcl),
  },
  {
    id: "azurerm_disk_not_encrypted",
    severity: "high",
    category: "Encryption",
    title: "Azure managed disk may not be encrypted",
    detail: "Set disk_encryption_set_id or enable Azure platform-managed encryption explicitly.",
    test: (hcl) =>
      /resource\s+"azurerm_managed_disk"/.test(hcl) &&
      !/disk_encryption_set_id|encryption_settings/i.test(hcl),
  },
  // ── Network exposure ────────────────────────────────────────────────────
  {
    id: "sg_open_ingress",
    severity: "critical",
    category: "Network",
    title: "Security group open to the internet (0.0.0.0/0)",
    detail: "cidr_blocks = [\"0.0.0.0/0\"] on a non-80/443 ingress rule exposes the port publicly.",
    test: (hcl) => {
      const blocks = hcl.match(/ingress\s*\{[^}]+\}/gs) || [];
      return blocks.some(
        (b) =>
          /0\.0\.0\.0\/0|:\/0/.test(b) &&
          !/from_port\s*=\s*(80|443)\b/.test(b) &&
          !/to_port\s*=\s*(80|443)\b/.test(b)
      );
    },
  },
  {
    id: "rds_publicly_accessible",
    severity: "critical",
    category: "Network",
    title: "RDS instance publicly accessible",
    detail: 'publicly_accessible = true exposes the database endpoint to the internet.',
    test: (hcl) => /publicly_accessible\s*=\s*true/i.test(hcl),
  },
  {
    id: "s3_public_acl",
    severity: "critical",
    category: "Access Control",
    title: "S3 bucket with public ACL",
    detail: 'acl = "public-read" or "public-read-write" makes all objects publicly readable.',
    test: (hcl) => /acl\s*=\s*"public-read(-write)?"/i.test(hcl),
  },
  {
    id: "s3_no_public_access_block",
    severity: "high",
    category: "Access Control",
    title: "S3 bucket missing public access block",
    detail: "Add aws_s3_bucket_public_access_block with all four block_* = true to prevent accidental public exposure.",
    test: (hcl) =>
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/aws_s3_bucket_public_access_block/i.test(hcl),
  },
  // ── Resilience ──────────────────────────────────────────────────────────
  {
    id: "rds_no_deletion_protection",
    severity: "medium",
    category: "Resilience",
    title: "RDS without deletion protection",
    detail: "deletion_protection = true prevents accidental database deletion.",
    test: (hcl) =>
      /resource\s+"aws_db_instance"|resource\s+"aws_rds_cluster"/.test(hcl) &&
      !/deletion_protection\s*=\s*true/i.test(hcl),
  },
  {
    id: "rds_no_backup",
    severity: "medium",
    category: "Resilience",
    title: "RDS backup retention not configured",
    detail: "Set backup_retention_period to at least 7 days for production databases.",
    test: (hcl) =>
      /resource\s+"aws_db_instance"/.test(hcl) &&
      !/backup_retention_period\s*=\s*[1-9]/i.test(hcl),
  },
  {
    id: "rds_no_multi_az",
    severity: "medium",
    category: "Resilience",
    title: "RDS not configured for Multi-AZ",
    detail: "multi_az = true provides automatic failover for production workloads.",
    test: (hcl) =>
      /resource\s+"aws_db_instance"/.test(hcl) &&
      !/multi_az\s*=\s*true/i.test(hcl),
  },
  // ── Secrets ─────────────────────────────────────────────────────────────
  {
    id: "hardcoded_password",
    severity: "critical",
    category: "Secrets",
    title: "Hardcoded password in Terraform",
    detail: 'password = "..." hardcodes credentials. Use var.* or aws_secretsmanager_secret instead.',
    test: (hcl) => /password\s*=\s*"[^${\s][^"]{4,}"/i.test(hcl),
  },
  {
    id: "hardcoded_key",
    severity: "critical",
    category: "Secrets",
    title: "Hardcoded API key or access key",
    detail: "Never hardcode access_key or secret_key — use environment variables or IAM roles.",
    test: (hcl) =>
      /(access_key|secret_key|api_key)\s*=\s*"[A-Za-z0-9+/]{10,}"/i.test(hcl) &&
      !/var\.\w+/.test(hcl.match(/(access_key|secret_key|api_key)\s*=\s*"([^"]+)"/i)?.[2] || ""),
  },
  // ── Logging ──────────────────────────────────────────────────────────────
  {
    id: "s3_no_logging",
    severity: "low",
    category: "Logging",
    title: "S3 bucket without access logging",
    detail: "Add a logging block or aws_s3_bucket_logging to audit bucket access.",
    test: (hcl) =>
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/aws_s3_bucket_logging|logging\s*\{/i.test(hcl),
  },
  {
    id: "no_cloudtrail",
    severity: "low",
    category: "Logging",
    title: "No CloudTrail configured",
    detail: "aws_cloudtrail enables API audit logging across your account.",
    test: (hcl) =>
      /resource\s+"aws_/.test(hcl) &&
      !/aws_cloudtrail/i.test(hcl),
  },
];

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "rose",   weight: 15 },
  high:     { label: "High",     color: "orange", weight: 10 },
  medium:   { label: "Medium",   color: "amber",  weight: 5  },
  low:      { label: "Low",      color: "slate",  weight: 2  },
};

const SEVERITY_STYLES = {
  critical: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  high:     "border-orange-400/30 bg-orange-500/10 text-orange-300",
  medium:   "border-amber-400/30 bg-amber-500/10 text-amber-300",
  low:      "border-slate-400/20 bg-slate-500/10 text-slate-400",
};

function scoreColor(score) {
  if (score >= 80) return { ring: "stroke-emerald-400", text: "text-emerald-300", label: "Good" };
  if (score >= 60) return { ring: "stroke-amber-400",   text: "text-amber-300",   label: "Fair" };
  if (score >= 40) return { ring: "stroke-orange-400",  text: "text-orange-300",  label: "Poor" };
  return           { ring: "stroke-rose-400",            text: "text-rose-300",    label: "Critical" };
}

function ScoreRing({ score }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const { ring, text, label } = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r}
          fill="none"
          className={ring}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="40" y="44" textAnchor="middle" className={`text-[14px] font-bold fill-current ${text}`} style={{ fontSize: 16 }}>
          {score}
        </text>
      </svg>
      <span className={`text-xs font-semibold ${text}`}>{label}</span>
    </div>
  );
}

export default function SecurityScorePanel({ files = {}, securityWarnings = [] }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { score, findings, counts } = useMemo(() => {
    const allHcl = Object.values(files).join("\n");

    const findings = CHECKS.filter((c) => {
      try { return c.test(allHcl); } catch { return false; }
    });

    // Add backend security_warnings as low-severity info items
    for (const w of securityWarnings) {
      if (!findings.find((f) => f.detail?.includes(w))) {
        findings.push({
          id: `backend_${w.slice(0, 20)}`,
          severity: "medium",
          category: "Scanner",
          title: w.length > 60 ? w.slice(0, 60) + "…" : w,
          detail: w,
          _fromBackend: true,
        });
      }
    }

    const deductions = findings.reduce(
      (sum, f) => sum + (SEVERITY_CONFIG[f.severity]?.weight || 2), 0
    );
    const score = Math.max(0, 100 - deductions);

    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

    return { score, findings, counts };
  }, [files, securityWarnings]);

  const hasTf = Object.keys(files).length > 0;
  if (!hasTf) return null;

  const grouped = {};
  for (const f of findings) {
    (grouped[f.category] = grouped[f.category] || []).push(f);
  }

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/[0.04]"
      >
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
            score >= 80 ? "bg-emerald-500/10 border-emerald-400/25 text-emerald-300"
            : score >= 60 ? "bg-amber-500/10 border-amber-400/25 text-amber-300"
            : "bg-rose-500/10 border-rose-400/25 text-rose-300"
          }`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">Security Score</p>
            <p className="text-xs text-slate-400">
              <span className={`font-semibold ${scoreColor(score).text}`}>{score}/100</span>
              {findings.length > 0 && (
                <> · {findings.length} finding{findings.length !== 1 ? "s" : ""}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {counts.critical > 0 && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
              {counts.critical} critical
            </span>
          )}
          <span className="text-slate-500 text-lg">{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-4">
          {/* Score ring + severity summary */}
          <div className="flex items-center gap-5">
            <ScoreRing score={score} />
            <div className="space-y-1.5 flex-1">
              {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => (
                counts[sev] > 0 && (
                  <div key={sev} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-${cfg.color}-400`} />
                    <span className="text-xs text-slate-400 flex-1">{cfg.label}</span>
                    <span className={`text-xs font-semibold text-${cfg.color}-300`}>{counts[sev]}</span>
                  </div>
                )
              ))}
              {findings.length === 0 && (
                <p className="text-sm text-emerald-300 font-medium">No issues detected</p>
              )}
            </div>
          </div>

          {/* Findings grouped by category */}
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {category}
              </p>
              <div className="space-y-1.5">
                {items.map((f) => (
                  <div
                    key={f.id}
                    className={`rounded-xl border p-3 ${SEVERITY_STYLES[f.severity]}`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase ${SEVERITY_STYLES[f.severity]}`}>
                          {f.severity}
                        </span>
                        <span className="text-xs font-medium leading-snug">{f.title}</span>
                      </div>
                      <span className="shrink-0 text-[10px] opacity-60">{expandedId === f.id ? "▲" : "▼"}</span>
                    </button>
                    {expandedId === f.id && (
                      <p className="mt-2 border-t border-current/10 pt-2 text-[11px] leading-relaxed opacity-80">
                        {f.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[10px] text-slate-600">
            Analysis is pattern-based and may have false positives. Always review generated Terraform before applying to production.
          </p>
        </div>
      )}
    </div>
  );
}
