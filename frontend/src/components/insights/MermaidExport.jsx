import React, { useMemo, useState } from "react";

const GROUPS = {
  network: ["vpc", "subnet", "internet_gateway", "nat_gateway", "route_table", "security_group",
    "virtual_network", "compute_network", "compute_subnetwork", "compute_firewall"],
  frontend: ["cloudfront_distribution", "alb", "lb", "application_gateway", "compute_url_map",
    "compute_global_forwarding_rule", "api_gateway", "cdn_profile", "api_management"],
  compute: ["instance", "ecs_service", "lambda_function", "eks_cluster", "container_app",
    "cloud_run_service", "cloudfunctions_function", "autoscaling_group", "compute_instance",
    "virtual_machine", "linux_virtual_machine", "function_app"],
  data: ["db_instance", "rds_cluster", "dynamodb_table", "s3_bucket", "elasticache_cluster",
    "elasticache_replication_group", "redis_cache", "cosmosdb_account", "sql_database",
    "sql_database_instance", "storage_account", "storage_bucket", "bigquery_dataset",
    "redis_instance", "bigtable_instance", "spanner_instance", "elasticsearch_domain",
    "opensearch_domain", "msk_cluster"],
  messaging: ["sqs_queue", "sns_topic", "kinesis_stream", "servicebus_namespace",
    "eventhub_namespace", "pubsub_topic"],
  security: ["iam_role", "kms_key", "secretsmanager_secret", "key_vault",
    "acm_certificate", "waf_web_acl", "ssm_parameter", "secret_manager_secret"],
};

const COMMON_EDGES = [
  [["cloudfront_distribution", "cdn_profile"], ["alb", "lb", "application_gateway", "compute_url_map"]],
  [["alb", "lb", "application_gateway"], ["instance", "ecs_service", "compute_instance", "virtual_machine", "container_app", "cloud_run_service"]],
  [["api_gateway", "api_management"], ["lambda_function", "cloudfunctions_function", "ecs_service", "cloud_run_service"]],
  [["lambda_function", "cloudfunctions_function", "cloud_run_service"], ["dynamodb_table", "s3_bucket", "storage_bucket", "sql_database_instance", "db_instance"]],
  [["instance", "ecs_service", "compute_instance", "virtual_machine", "container_app"], ["db_instance", "rds_cluster", "elasticache_cluster", "elasticache_replication_group", "redis_cache", "redis_instance", "sql_database", "sql_database_instance", "cosmosdb_account", "dynamodb_table"]],
  [["eks_cluster", "kubernetes_cluster", "container_cluster"], ["db_instance", "rds_cluster", "redis_cache", "elasticache_cluster"]],
  [["nat_gateway"], ["internet_gateway"]],
  [["instance", "compute_instance", "virtual_machine", "ecs_service"], ["sqs_queue", "sns_topic", "pubsub_topic", "eventhub_namespace"]],
];

function getGroup(resourceType) {
  const t = resourceType.replace(/^(aws_|azurerm_|google_)/, "");
  for (const [group, patterns] of Object.entries(GROUPS)) {
    if (patterns.some((p) => t.includes(p))) return group;
  }
  return "other";
}

const GROUP_STYLES = {
  network: "fill:#1e3a5f,stroke:#3b82f6,color:#93c5fd",
  frontend: "fill:#312e81,stroke:#8b5cf6,color:#c4b5fd",
  compute: "fill:#1e3a1e,stroke:#22c55e,color:#86efac",
  data: "fill:#3b1f1f,stroke:#ef4444,color:#fca5a5",
  messaging: "fill:#3b2f1f,stroke:#f59e0b,color:#fcd34d",
  security: "fill:#2d2d1f,stroke:#eab308,color:#fef08a",
  other: "fill:#1f2937,stroke:#6b7280,color:#d1d5db",
};

function shortLabel(resourceType, localId) {
  const stripped = resourceType.replace(/^(aws_|azurerm_|google_)/, "");
  const label = localId.replace(/_/g, " ");
  return `${label}\\n(${stripped.replace(/_/g, " ")})`;
}

function nodeId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, "_");
}

function typeFrom(r) {
  return r.includes(":") ? r.split(":")[0] : r;
}
function localIdFrom(r) {
  return r.includes(":") ? r.split(":")[1] : r;
}

function stripPrefix(t) {
  return t.replace(/^(aws_|azurerm_|google_)/, "");
}

function buildMermaid(resources) {
  if (!resources.length) return "";

  const nodes = resources.map((r) => ({
    raw: r,
    type: typeFrom(r),
    localId: localIdFrom(r),
    group: getGroup(typeFrom(r)),
    nid: nodeId(localIdFrom(r) + "_" + typeFrom(r)),
  }));

  const lines = ["graph TD"];

  // Subgraph per group
  const byGroup = {};
  for (const n of nodes) {
    (byGroup[n.group] = byGroup[n.group] || []).push(n);
  }

  for (const [group, gnodes] of Object.entries(byGroup)) {
    if (gnodes.length === 1) {
      const n = gnodes[0];
      lines.push(`  ${n.nid}["${shortLabel(n.type, n.localId)}"]`);
    } else {
      lines.push(`  subgraph ${group}`);
      for (const n of gnodes) {
        lines.push(`    ${n.nid}["${shortLabel(n.type, n.localId)}"]`);
      }
      lines.push("  end");
    }
  }

  // Infer edges
  const addedEdges = new Set();
  for (const [sources, targets] of COMMON_EDGES) {
    const srcNodes = nodes.filter((n) => sources.some((s) => stripPrefix(n.type).includes(s)));
    const tgtNodes = nodes.filter((n) => targets.some((t) => stripPrefix(n.type).includes(t)));
    for (const s of srcNodes) {
      for (const t of tgtNodes) {
        if (s.nid === t.nid) continue;
        const key = `${s.nid}->${t.nid}`;
        if (!addedEdges.has(key)) {
          addedEdges.add(key);
          lines.push(`  ${s.nid} --> ${t.nid}`);
        }
      }
    }
  }

  // Style per group
  for (const n of nodes) {
    const style = GROUP_STYLES[n.group] || GROUP_STYLES.other;
    lines.push(`  style ${n.nid} ${style}`);
  }

  return lines.join("\n");
}

export default function MermaidExport({ resources = [] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const diagram = useMemo(() => buildMermaid(resources), [resources]);

  if (resources.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const mermaidLiveUrl = `https://mermaid.live/edit#pako:${btoa(
    JSON.stringify({ code: diagram, mermaid: { theme: "dark" } })
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/[0.04]"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 text-violet-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="4" height="4" rx="1" />
              <rect x="17" y="3" width="4" height="4" rx="1" />
              <rect x="10" y="17" width="4" height="4" rx="1" />
              <path d="M5 7v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" />
              <path d="M12 13v4" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">Architecture Diagram</p>
            <p className="text-xs text-slate-400">Export as Mermaid graph</p>
          </div>
        </div>
        <span className="text-slate-500 text-lg">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-3 space-y-3">
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre">
            {diagram}
          </pre>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="m9 11 3 3L22 4" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Mermaid
                </>
              )}
            </button>

            <a
              href={mermaidLiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs px-3 py-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open in Mermaid Live
            </a>
          </div>

          <p className="text-[11px] text-slate-600">
            Edges are inferred from common cloud topology patterns. Paste into mermaid.live or any Markdown viewer that supports Mermaid.
          </p>
        </div>
      )}
    </div>
  );
}
