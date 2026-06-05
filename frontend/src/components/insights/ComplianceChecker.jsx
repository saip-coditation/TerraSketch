import React, { useMemo, useState } from "react";

// ── Compliance control definitions ───────────────────────────────────────────
// Each control maps to one or more compliance frameworks.
// test(hcl) returns true when the control is PASSING.

const CONTROLS = [
  // ── CIS AWS Foundations Benchmark ─────────────────────────────────────────
  {
    id: "cis_1_1",
    frameworks: ["CIS AWS"],
    section: "1.1",
    title: "Avoid use of root account",
    test: (hcl) => !/resource\s+"aws_iam_user"\s+"root"/.test(hcl),
  },
  {
    id: "cis_1_4",
    frameworks: ["CIS AWS"],
    section: "1.4",
    title: "No IAM wildcard (*) action policies",
    test: (hcl) => !/actions\s*=\s*\[.*"\*".*\]/i.test(hcl),
  },
  {
    id: "cis_1_5",
    frameworks: ["CIS AWS"],
    section: "1.5",
    title: "No IAM wildcard (*) resource policies",
    test: (hcl) => !/resources\s*=\s*\[.*"\*".*\]/i.test(hcl),
  },
  {
    id: "cis_2_1",
    frameworks: ["CIS AWS"],
    section: "2.1",
    title: "S3 server-side encryption enabled",
    test: (hcl) =>
      !/resource\s+"aws_s3_bucket"/.test(hcl) ||
      /aws_s3_bucket_server_side_encryption_configuration|server_side_encryption_configuration/.test(hcl),
  },
  {
    id: "cis_2_2",
    frameworks: ["CIS AWS"],
    section: "2.2",
    title: "S3 bucket versioning enabled",
    test: (hcl) =>
      !/resource\s+"aws_s3_bucket"/.test(hcl) ||
      /aws_s3_bucket_versioning|versioning\s*\{[\s\S]{0,80}enabled\s*=\s*true/.test(hcl),
  },
  {
    id: "cis_2_3",
    frameworks: ["CIS AWS"],
    section: "2.3",
    title: "S3 bucket public access blocked",
    test: (hcl) =>
      !/resource\s+"aws_s3_bucket"/.test(hcl) ||
      /aws_s3_bucket_public_access_block/.test(hcl),
  },
  {
    id: "cis_3_1",
    frameworks: ["CIS AWS"],
    section: "3.1",
    title: "CloudTrail enabled in all regions",
    test: (hcl) => /resource\s+"aws_cloudtrail"/.test(hcl),
  },
  {
    id: "cis_3_2",
    frameworks: ["CIS AWS"],
    section: "3.2",
    title: "CloudTrail log file validation enabled",
    test: (hcl) =>
      !/resource\s+"aws_cloudtrail"/.test(hcl) ||
      /enable_log_file_validation\s*=\s*true/.test(hcl),
  },
  {
    id: "cis_4_1",
    frameworks: ["CIS AWS"],
    section: "4.1",
    title: "No security group allows 0.0.0.0/0 SSH (port 22)",
    test: (hcl) =>
      !/from_port\s*=\s*22[\s\S]{0,60}cidr_blocks\s*=\s*\[.*0\.0\.0\.0\/0/.test(hcl),
  },
  {
    id: "cis_4_2",
    frameworks: ["CIS AWS"],
    section: "4.2",
    title: "No security group allows 0.0.0.0/0 RDP (port 3389)",
    test: (hcl) =>
      !/from_port\s*=\s*3389[\s\S]{0,60}cidr_blocks\s*=\s*\[.*0\.0\.0\.0\/0/.test(hcl),
  },

  // ── PCI-DSS ───────────────────────────────────────────────────────────────
  {
    id: "pci_req_1",
    frameworks: ["PCI-DSS"],
    section: "Req 1",
    title: "Firewall/security group controls network access",
    test: (hcl) => /resource\s+"aws_security_group"|resource\s+"azurerm_network_security_group"|resource\s+"google_compute_firewall"/.test(hcl),
  },
  {
    id: "pci_req_3",
    frameworks: ["PCI-DSS"],
    section: "Req 3",
    title: "Cardholder data storage encrypted at rest",
    test: (hcl) =>
      !/resource\s+"aws_db_instance"/.test(hcl) ||
      /storage_encrypted\s*=\s*true/.test(hcl),
  },
  {
    id: "pci_req_4",
    frameworks: ["PCI-DSS"],
    section: "Req 4",
    title: "Data encrypted in transit (TLS/HTTPS)",
    test: (hcl) =>
      /ssl_policy|https_listener|certificate_arn|listener_rule.*443|tls_config|minimum_protocol_version/.test(hcl),
  },
  {
    id: "pci_req_6",
    frameworks: ["PCI-DSS"],
    section: "Req 6",
    title: "WAF or application firewall present",
    test: (hcl) => /resource\s+"aws_wafv2_web_acl"|resource\s+"aws_waf_web_acl"|resource\s+"azurerm_web_application_firewall_policy"/.test(hcl),
  },
  {
    id: "pci_req_7",
    frameworks: ["PCI-DSS"],
    section: "Req 7",
    title: "Least-privilege IAM (no wildcard actions)",
    test: (hcl) => !/actions\s*=\s*\[.*"\*".*\]/i.test(hcl),
  },
  {
    id: "pci_req_10",
    frameworks: ["PCI-DSS"],
    section: "Req 10",
    title: "Audit logging enabled (CloudTrail / Flow Logs)",
    test: (hcl) =>
      /resource\s+"aws_cloudtrail"|enable_dns_support|flow_log|resource\s+"aws_flow_log"/.test(hcl),
  },

  // ── SOC 2 ─────────────────────────────────────────────────────────────────
  {
    id: "soc2_cc6_1",
    frameworks: ["SOC 2"],
    section: "CC6.1",
    title: "Logical access controls (IAM roles/policies present)",
    test: (hcl) =>
      /resource\s+"aws_iam_role"|resource\s+"aws_iam_policy"|resource\s+"azurerm_role_assignment"|resource\s+"google_project_iam_binding"/.test(hcl),
  },
  {
    id: "soc2_cc6_7",
    frameworks: ["SOC 2"],
    section: "CC6.7",
    title: "Encryption of data at rest",
    test: (hcl) =>
      /storage_encrypted\s*=\s*true|encrypted\s*=\s*true|kms_key_id|server_side_encryption/.test(hcl),
  },
  {
    id: "soc2_cc7_1",
    frameworks: ["SOC 2"],
    section: "CC7.1",
    title: "System monitoring / logging configured",
    test: (hcl) =>
      /resource\s+"aws_cloudwatch_log_group"|resource\s+"aws_cloudtrail"|enable_monitoring\s*=\s*true/.test(hcl),
  },
  {
    id: "soc2_a1_2",
    frameworks: ["SOC 2"],
    section: "A1.2",
    title: "High availability / Multi-AZ deployed",
    test: (hcl) =>
      /multi_az\s*=\s*true|availability_zones|az_count|az_mode/.test(hcl),
  },
  {
    id: "soc2_cc9_1",
    frameworks: ["SOC 2"],
    section: "CC9.1",
    title: "Automated backups configured",
    test: (hcl) =>
      /backup_retention_period\s*=\s*[1-9]|backup_policy|lifecycle_rule|automated_snapshot/.test(hcl),
  },
];

const FRAMEWORKS = ["CIS AWS", "PCI-DSS", "SOC 2"];

const FRAMEWORK_META = {
  "CIS AWS":  { color: "text-brand-300",   bg: "bg-brand-500/10 border-brand-500/20",   icon: "🛡️" },
  "PCI-DSS":  { color: "text-violet-300",  bg: "bg-violet-500/10 border-violet-500/20", icon: "💳" },
  "SOC 2":    { color: "text-amber-300",   bg: "bg-amber-500/10 border-amber-500/20",   icon: "📋" },
};

function ScoreBar({ percent, color }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function FrameworkCard({ name, controls, results }) {
  const [open, setOpen] = useState(false);
  const passed = controls.filter((c) => results[c.id]).length;
  const total  = controls.length;
  const pct    = total ? Math.round((passed / total) * 100) : 100;
  const meta   = FRAMEWORK_META[name];

  const barColor =
    pct >= 80 ? "bg-emerald-400" :
    pct >= 60 ? "bg-amber-400"   :
    pct >= 40 ? "bg-orange-400"  : "bg-rose-400";

  const scoreColor =
    pct >= 80 ? "text-emerald-300" :
    pct >= 60 ? "text-amber-300"   :
    pct >= 40 ? "text-orange-300"  : "text-rose-300";

  return (
    <div className={`rounded-lg border ${meta.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 p-3 text-left"
      >
        <span className="text-sm">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-slate-200">{name}</span>
            <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>{pct}%</span>
          </div>
          <ScoreBar percent={pct} color={barColor} />
          <p className="mt-1 text-[10px] text-slate-500">{passed}/{total} controls passing</p>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-1.5">
          {controls.map((c) => {
            const pass = results[c.id];
            return (
              <div key={c.id} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 text-sm ${pass ? "text-emerald-400" : "text-rose-400"}`}>
                  {pass ? "✓" : "✗"}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-500 font-mono mr-1">{c.section}</span>
                  <span className={`text-xs ${pass ? "text-slate-300" : "text-slate-400"}`}>{c.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ComplianceChecker({ files = {} }) {
  const hcl = useMemo(() => Object.values(files).join("\n"), [files]);
  const [expanded, setExpanded] = useState(true);

  const results = useMemo(() => {
    const out = {};
    for (const c of CONTROLS) {
      try { out[c.id] = c.test(hcl); }
      catch { out[c.id] = false; }
    }
    return out;
  }, [hcl]);

  const totalPassed = CONTROLS.filter((c) => results[c.id]).length;
  const overallPct  = Math.round((totalPassed / CONTROLS.length) * 100);

  const overallColor =
    overallPct >= 80 ? "text-emerald-300" :
    overallPct >= 60 ? "text-amber-300"   :
    overallPct >= 40 ? "text-orange-300"  : "text-rose-300";

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-base">🏛️</span>
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-300">
          Compliance Checker
        </h3>
        <span className={`mr-1 text-xs font-bold tabular-nums ${overallColor}`}>
          {overallPct}%
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        CIS AWS Foundations · PCI-DSS · SOC 2 — static analysis of generated HCL.
      </p>

      {expanded && (
        <div className="mt-3 space-y-2">
          {FRAMEWORKS.map((fw) => {
            const controls = CONTROLS.filter((c) => c.frameworks.includes(fw));
            return (
              <FrameworkCard
                key={fw}
                name={fw}
                controls={controls}
                results={results}
              />
            );
          })}
          <p className="text-[10px] text-slate-600 pt-1">
            Results are based on static analysis of Terraform HCL. Not a substitute for a full compliance audit.
          </p>
        </div>
      )}
    </div>
  );
}
