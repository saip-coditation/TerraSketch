import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { parseResources, parseEdges } from "../../utils/hclParse.js";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  darkMode: true,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  flowchart: { curve: "basis", padding: 24, nodeSpacing: 55, rankSpacing: 70 },
  themeVariables: {
    background: "#0f172a",
    primaryColor: "#1e3a5f",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#3b82f6",
    lineColor: "#94a3b8",
    secondaryColor: "#1e293b",
    tertiaryColor: "#0f172a",
    edgeLabelBackground: "#1e293b",
    clusterBkg: "#1a2744",
    clusterBorder: "#334155",
  },
});

// Map plain-text resource names → group
const GROUP_KEYWORDS = {
  network: ["vpc", "vnet", "subnet", "internet gateway", "igw", "nat gateway", "nat", "route table", "routing", "security group", "firewall", "network", "cidr"],
  frontend: ["cloudfront", "cdn", "alb", "load balancer", "application gateway", "api gateway", "api management", "waf", "ingress"],
  compute: ["ec2", "instance", "server", "ecs", "eks", "kubernetes", "lambda", "function", "fargate", "container", "cloud run", "app service", "vm", "virtual machine", "autoscaling", "asg"],
  data: ["rds", "database", "mysql", "postgres", "aurora", "dynamodb", "s3", "storage", "bucket", "elasticache", "redis", "cache", "cosmos", "firestore", "sql", "mongo", "opensearch", "elasticsearch"],
  messaging: ["sqs", "sns", "queue", "topic", "kinesis", "event", "pubsub", "service bus", "kafka", "msk"],
  security: ["iam", "role", "policy", "kms", "key", "secret", "certificate", "acm", "vault", "permission"],
};

const GROUP_STYLES = {
  network:   "fill:#1e3a5f,stroke:#3b82f6,color:#bfdbfe",
  frontend:  "fill:#2e1065,stroke:#8b5cf6,color:#ddd6fe",
  compute:   "fill:#052e16,stroke:#22c55e,color:#bbf7d0",
  data:      "fill:#450a0a,stroke:#ef4444,color:#fecaca",
  messaging: "fill:#431407,stroke:#f97316,color:#fed7aa",
  security:  "fill:#422006,stroke:#eab308,color:#fef9c3",
  other:     "fill:#1e293b,stroke:#64748b,color:#cbd5e1",
};

// Directed edge rules: if a node in `from` groups exists AND a node in `to` groups exists → draw arrow
const EDGE_RULES = [
  { from: "frontend", to: "compute",   label: "routes to" },
  { from: "compute",  to: "data",      label: "reads/writes" },
  { from: "compute",  to: "messaging", label: "publishes" },
  { from: "messaging",to: "compute",   label: "triggers" },
  { from: "network",  to: "compute",   label: "hosts" },
  { from: "network",  to: "frontend",  label: "exposes" },
  { from: "security", to: "compute",   label: "authorizes" },
  { from: "security", to: "data",      label: "secures" },
];

// Fine-grained keyword edges within the same resource list
const KEYWORD_EDGES = [
  { from: ["internet gateway", "igw"], to: ["vpc", "subnet", "route table"] },
  { from: ["load balancer", "alb", "cloudfront", "cdn", "api gateway"], to: ["ec2", "instance", "ecs", "fargate", "lambda", "function", "container", "app service", "cloud run", "server"] },
  { from: ["ec2", "instance", "ecs", "fargate", "container", "server", "lambda", "function"], to: ["rds", "database", "mysql", "postgres", "aurora", "dynamodb", "s3", "bucket", "redis", "cache", "elasticache"] },
  { from: ["ec2", "instance", "server", "ecs", "lambda"], to: ["sqs", "sns", "queue", "topic", "kinesis", "event"] },
  { from: ["nat gateway", "nat"], to: ["internet gateway", "igw"] },
  { from: ["iam", "role"], to: ["ec2", "instance", "lambda", "function", "ecs"] },
  { from: ["subnet"], to: ["ec2", "instance", "rds", "database", "ecs"] },
  { from: ["vpc", "vnet"], to: ["subnet", "internet gateway", "nat gateway", "security group"] },
];

function detectGroup(name) {
  const lower = name.toLowerCase();
  for (const [group, keywords] of Object.entries(GROUP_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return group;
  }
  return "other";
}

// Group a Terraform resource *type* (e.g. aws_db_instance) into a layer.
function groupForType(type) {
  const t = type.toLowerCase();
  if (/vpc|subnet|_gateway|route|_network|firewall|security_group|nat|peering|vpn/.test(t)) return "network";
  if (/cloudfront|cdn|_lb\b|alb|nlb|load_balanc|api_gateway|apigateway|application_gateway|api_management|waf/.test(t)) return "frontend";
  if (/instance|ecs|eks|gke|aks|lambda|function|container|cloud_run|app_service|kubernetes|node_group|node_pool|autoscaling|compute_instance|virtual_machine/.test(t)) return "compute";
  if (/_db|rds|aurora|dynamodb|s3_bucket|storage|bucket|elasticache|redis|cosmos|sql|spanner|bigtable|bigquery|opensearch|elasticsearch|memorystore/.test(t)) return "data";
  if (/sqs|sns|queue|topic|kinesis|event|pubsub|servicebus|service_bus|msk|kafka/.test(t)) return "messaging";
  if (/iam|kms|secret|key_vault|acm|certificate|vault/.test(t)) return "security";
  return "other";
}

// Build the diagram from the ACTUAL Terraform code: nodes are real resource
// blocks, edges are real interpolation references between them.
function buildMermaidFromBlocks(blocks, edges) {
  if (!blocks.length) return "";

  const nodes = blocks.map((b) => ({
    id: safeId(b.address),
    label: b.name,
    type: b.type,
    group: groupForType(b.type),
  }));

  const seen = new Set();
  const unique = nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  const ids = new Set(unique.map((n) => n.id));

  const lines = ["graph TD"];

  const byGroup = {};
  for (const n of unique) (byGroup[n.group] = byGroup[n.group] || []).push(n);

  for (const [group, gnodes] of Object.entries(byGroup)) {
    const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);
    if (gnodes.length > 1) {
      lines.push(`  subgraph ${group}["${groupLabel}"]`);
      for (const n of gnodes) lines.push(`    ${n.id}["${n.label}<br/><small>${n.type}</small>"]`);
      lines.push("  end");
    } else {
      lines.push(`  ${gnodes[0].id}["${gnodes[0].label}<br/><small>${gnodes[0].type}</small>"]`);
    }
  }

  const added = new Set();
  for (const e of edges) {
    const from = safeId(e.from);
    const to = safeId(e.to);
    const key = `${from}-->${to}`;
    if (from === to || !ids.has(from) || !ids.has(to) || added.has(key)) continue;
    added.add(key);
    lines.push(`  ${from} --> ${to}`);
  }

  for (const n of unique) {
    lines.push(`  style ${n.id} ${GROUP_STYLES[n.group] || GROUP_STYLES.other}`);
  }

  return lines.join("\n");
}

function safeId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function shortName(name) {
  // Strip parenthetical provider suffixes like "(Amazon RDS)", "(AWS)"
  return name.replace(/\s*\([^)]*\)\s*/g, "").trim() || name;
}

function buildMermaid(resources) {
  if (!resources.length) return "";

  const nodes = resources.map((r) => ({
    raw: r,
    id: safeId(r),
    label: shortName(r),
    group: detectGroup(r),
  }));

  // Deduplicate IDs
  const seen = new Set();
  const unique = nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  const lines = ["graph TD"];

  // Group nodes into subgraphs
  const byGroup = {};
  for (const n of unique) (byGroup[n.group] = byGroup[n.group] || []).push(n);

  for (const [group, gnodes] of Object.entries(byGroup)) {
    const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);
    if (gnodes.length > 1) {
      lines.push(`  subgraph ${group}["${groupLabel}"]`);
      for (const n of gnodes) lines.push(`    ${n.id}["${n.label}"]`);
      lines.push("  end");
    } else {
      lines.push(`  ${gnodes[0].id}["${gnodes[0].label}"]`);
    }
  }

  // Add edges — fine-grained keyword matching first
  const addedEdges = new Set();
  const addEdge = (fromId, toId) => {
    const key = `${fromId}-->${toId}`;
    if (fromId !== toId && !addedEdges.has(key)) {
      addedEdges.add(key);
      lines.push(`  ${fromId} --> ${toId}`);
    }
  };

  for (const rule of KEYWORD_EDGES) {
    const fromNodes = unique.filter((n) => rule.from.some((k) => n.raw.toLowerCase().includes(k)));
    const toNodes   = unique.filter((n) => rule.to.some((k) => n.raw.toLowerCase().includes(k)));
    for (const f of fromNodes) for (const t of toNodes) addEdge(f.id, t.id);
  }

  // Fallback: group-level edges if few keyword edges fired
  if (addedEdges.size < 2) {
    for (const rule of EDGE_RULES) {
      const fromNodes = unique.filter((n) => n.group === rule.from);
      const toNodes   = unique.filter((n) => n.group === rule.to);
      for (const f of fromNodes) for (const t of toNodes) addEdge(f.id, t.id);
    }
  }

  // Styles
  for (const n of unique) {
    const style = GROUP_STYLES[n.group] || GROUP_STYLES.other;
    lines.push(`  style ${n.id} ${style}`);
  }

  return lines.join("\n");
}

function MermaidDiagram({ diagram }) {
  const id = useId().replace(/:/g, "_");
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!diagram) return;
    let cancelled = false;
    setSvg(null);
    setError(null);
    mermaid.render(`mermaid_${id}`, diagram)
      .then(({ svg: rendered }) => { if (!cancelled) setSvg(rendered); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Render failed"); });
    return () => { cancelled = true; };
  }, [diagram, id]);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-300">
        Diagram render failed — use "Open in Mermaid Live" to view it.
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-slate-500">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="overflow-auto rounded-xl border border-white/10 bg-[#0f172a] p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function MermaidExport({ resources = [], files = null }) {
  const [open, setOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const { diagram, fromCode } = useMemo(() => {
    const blocks = files ? parseResources(files) : [];
    if (blocks.length) {
      return { diagram: buildMermaidFromBlocks(blocks, parseEdges(blocks)), fromCode: true };
    }
    return { diagram: buildMermaid(resources), fromCode: false };
  }, [resources, files]);

  if (!diagram) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(diagram); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
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
              <rect x="3" y="3" width="4" height="4" rx="1" /><rect x="17" y="3" width="4" height="4" rx="1" />
              <rect x="10" y="17" width="4" height="4" rx="1" />
              <path d="M5 7v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" /><path d="M12 13v4" />
            </svg>
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              Block Diagram
              {fromCode && (
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-1.5 py-0 text-[10px] font-medium text-violet-300">
                  from code
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400">
              {fromCode ? "Mapped from your Terraform" : "Visual Mermaid graph"}
            </p>
          </div>
        </div>
        <span className="text-slate-500 text-lg">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-3">
          <MermaidDiagram diagram={diagram} />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              {copied ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="m9 11 3 3L22 4" /></svg>Copied!</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy Mermaid</>
              )}
            </button>
            <a href={mermaidLiveUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open in Mermaid Live
            </a>
            <button type="button" onClick={() => setShowCode((s) => !s)} className="btn-secondary text-xs px-3 py-1.5">
              {showCode ? "Hide code" : "Show code"}
            </button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(GROUP_STYLES).filter(([g]) => g !== "other").map(([group, style]) => {
              const color = style.match(/stroke:([^,]+)/)?.[1] || "#64748b";
              return (
                <span key={group} className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                  {group.charAt(0).toUpperCase() + group.slice(1)}
                </span>
              );
            })}
          </div>

          {showCode && (
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre">
              {diagram}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
