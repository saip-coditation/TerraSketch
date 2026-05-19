import React from "react";

const TIERS = [
  {
    level: "Simple",
    scoreMax: 22,
    color: "emerald",
    bg: "bg-emerald-500/10 border-emerald-400/25",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
    description: "Straightforward architecture — easy to deploy and maintain.",
  },
  {
    level: "Moderate",
    scoreMax: 50,
    color: "brand",
    bg: "bg-brand-500/10 border-brand-400/25",
    text: "text-brand-300",
    dot: "bg-brand-400",
    description: "Multi-tier architecture with moderate cross-service dependencies.",
  },
  {
    level: "Complex",
    scoreMax: 90,
    color: "amber",
    bg: "bg-amber-500/10 border-amber-400/25",
    text: "text-amber-300",
    dot: "bg-amber-400",
    description: "Distributed architecture — plan capacity, observability, and on-call runbooks.",
  },
  {
    level: "Enterprise",
    scoreMax: Infinity,
    color: "rose",
    bg: "bg-rose-500/10 border-rose-400/25",
    text: "text-rose-300",
    dot: "bg-rose-400",
    description: "Large-scale architecture — requires FinOps review and detailed DR planning.",
  },
];

const SIGNALS = [
  { label: "Network layer", test: (r) => /vpc|vnet|virtual_network|compute_network|internet_gateway|nat_gateway|subnet/.test(r) },
  { label: "Load balancing", test: (r) => /\balb\b|_lb\b|load_balancer|application_gateway|compute_url_map|api_gateway|api_management/.test(r) },
  { label: "Compute", test: (r) => /instance|ecs_service|lambda|function_app|cloud_run|container_app|virtual_machine|compute_instance/.test(r) },
  { label: "Databases", test: (r) => /db_instance|rds_cluster|dynamo|cosmos|sql_database|sql_database_instance|bigtable|spanner/.test(r) },
  { label: "Caching", test: (r) => /redis|elasticache|memorystore/.test(r) },
  { label: "Object storage", test: (r) => /s3_bucket|storage_account|storage_bucket/.test(r) },
  { label: "Messaging", test: (r) => /sqs|sns|pubsub|kinesis|eventhub|servicebus/.test(r) },
  { label: "Security controls", test: (r) => /\biam\b|kms|secretsmanager|key_vault|waf|acm_certificate|secret_manager/.test(r) },
  { label: "Container orchestration", test: (r) => /eks|ecs_cluster|kubernetes|container_cluster|aks/.test(r) },
  { label: "CDN / Edge", test: (r) => /cloudfront|cdn_profile|compute_global_forwarding/.test(r) },
];

function computeComplexity(resources) {
  const typeStrs = resources.map((r) => (r.includes(":") ? r.split(":")[0] : r));
  const uniqueTypes = new Set(typeStrs);
  const total = resources.length;

  const activeSignals = SIGNALS.filter((s) => typeStrs.some(s.test));
  const tierCount = activeSignals.length;

  // Score: count of resources (weight 2) + unique types (weight 3) + tier diversity (weight 5)
  const score = total * 2 + uniqueTypes.size * 3 + tierCount * 5;

  const tier = TIERS.find((t) => score <= t.scoreMax) || TIERS[TIERS.length - 1];

  return { tier, score, total, uniqueTypes: uniqueTypes.size, tierCount, activeSignals };
}

export default function ComplexityBadge({ resources = [] }) {
  if (resources.length === 0) return null;

  const { tier, total, uniqueTypes, activeSignals } = computeComplexity(resources);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${tier.bg}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={tier.text}>
                <path d="M12 2 2 7l10 5 10-5-10-5z" />
                <path d="m2 17 10 5 10-5" />
                <path d="m2 12 10 5 10-5" />
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Architecture complexity</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tier.dot}`} />
                <span className={`text-base font-bold ${tier.text}`}>{tier.level}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">Resources</p>
            <p className="text-lg font-bold text-slate-200">{total}</p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">{tier.description}</p>

        {/* Signal pills */}
        {activeSignals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeSignals.map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                  <circle cx="4" cy="4" r="3" fill="currentColor" className={tier.dot.replace("bg-", "text-")} />
                </svg>
                {s.label}
              </span>
            ))}
          </div>
        )}

        {/* Mini stat row */}
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          {[
            { label: "Total resources", value: total },
            { label: "Unique types", value: uniqueTypes },
            { label: "Service layers", value: activeSignals.length },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-base font-bold text-slate-200">{stat.value}</p>
              <p className="text-[9px] text-slate-600 leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
