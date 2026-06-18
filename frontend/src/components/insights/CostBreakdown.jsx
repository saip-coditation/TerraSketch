import React, { useMemo, useState } from "react";
import { parseResources, readCount, readSize } from "../../utils/hclParse.js";
import { getCostBreakdown } from "../../services/api.js";

/**
 * CostBreakdown — monthly cost estimate derived from the ACTUAL generated
 * Terraform code (resource blocks, counts and instance sizes), not from a
 * loose resource-name list. Falls back to a name-based estimate when no
 * parseable resource blocks are available.
 *
 * Note: this is a static rate-card estimate (US on-demand, default region).
 * For live cloud-API pricing, wire a backend Infracost endpoint and feed its
 * numbers in via the `serverBreakdown` prop.
 */

// Base monthly $ for a "reference" (medium) size of each Terraform type.
const RATES = {
  // ── AWS ──
  aws_instance: { label: "EC2 Instance", base: 30, sized: true },
  aws_db_instance: { label: "RDS Instance", base: 60, sized: true },
  aws_rds_cluster_instance: { label: "Aurora Instance", base: 90, sized: true },
  aws_rds_cluster: { label: "Aurora Cluster", base: 0 },
  aws_lb: { label: "Load Balancer", base: 16 },
  aws_alb: { label: "Application LB", base: 16 },
  aws_elb: { label: "Classic LB", base: 16 },
  aws_s3_bucket: { label: "S3 Bucket", base: 2 },
  aws_cloudfront_distribution: { label: "CloudFront", base: 5 },
  aws_lambda_function: { label: "Lambda Function", base: 1 },
  aws_elasticache_cluster: { label: "ElastiCache", base: 13, sized: true },
  aws_elasticache_replication_group: { label: "ElastiCache Redis", base: 50, sized: true },
  aws_eks_cluster: { label: "EKS Cluster", base: 72 },
  aws_eks_node_group: { label: "EKS Node Group", base: 30, sized: true },
  aws_ecs_service: { label: "ECS Service (Fargate)", base: 25 },
  aws_nat_gateway: { label: "NAT Gateway", base: 32 },
  aws_api_gateway_rest_api: { label: "API Gateway", base: 3 },
  aws_apigatewayv2_api: { label: "API Gateway (HTTP)", base: 3 },
  aws_dynamodb_table: { label: "DynamoDB Table", base: 5 },
  aws_sqs_queue: { label: "SQS Queue", base: 1 },
  aws_sns_topic: { label: "SNS Topic", base: 1 },
  aws_route53_zone: { label: "Route 53 Zone", base: 1 },
  aws_wafv2_web_acl: { label: "WAF Web ACL", base: 5 },
  aws_waf_web_acl: { label: "WAF Web ACL", base: 5 },
  aws_kinesis_stream: { label: "Kinesis Stream", base: 15 },
  aws_opensearch_domain: { label: "OpenSearch Domain", base: 100, sized: true },
  aws_elasticsearch_domain: { label: "OpenSearch Domain", base: 100, sized: true },
  aws_msk_cluster: { label: "MSK Cluster", base: 200 },
  aws_ecr_repository: { label: "ECR Repository", base: 1 },
  aws_cloudwatch_log_group: { label: "CloudWatch Logs", base: 2 },
  aws_secretsmanager_secret: { label: "Secrets Manager", base: 1 },
  aws_kms_key: { label: "KMS Key", base: 1 },
  // ── Azure ──
  azurerm_virtual_machine: { label: "Virtual Machine", base: 30, sized: true },
  azurerm_linux_virtual_machine: { label: "Linux VM", base: 30, sized: true },
  azurerm_windows_virtual_machine: { label: "Windows VM", base: 50, sized: true },
  azurerm_mssql_database: { label: "SQL Database", base: 15, sized: true },
  azurerm_sql_database: { label: "SQL Database", base: 15, sized: true },
  azurerm_application_gateway: { label: "Application Gateway", base: 25 },
  azurerm_lb: { label: "Load Balancer", base: 5 },
  azurerm_storage_account: { label: "Storage Account", base: 2 },
  azurerm_cdn_profile: { label: "CDN Profile", base: 5 },
  azurerm_linux_function_app: { label: "Function App", base: 1 },
  azurerm_function_app: { label: "Function App", base: 1 },
  azurerm_redis_cache: { label: "Redis Cache", base: 25, sized: true },
  azurerm_kubernetes_cluster: { label: "AKS Cluster", base: 72 },
  azurerm_container_app: { label: "Container App", base: 10 },
  azurerm_cosmosdb_account: { label: "Cosmos DB", base: 25 },
  azurerm_servicebus_namespace: { label: "Service Bus", base: 10 },
  azurerm_eventhub_namespace: { label: "Event Hub", base: 10 },
  azurerm_api_management: { label: "API Management", base: 50 },
  azurerm_public_ip: { label: "Public IP", base: 3 },
  azurerm_nat_gateway: { label: "NAT Gateway", base: 32 },
  azurerm_key_vault: { label: "Key Vault", base: 1 },
  // ── GCP ──
  google_compute_instance: { label: "Compute Instance", base: 25, sized: true },
  google_sql_database_instance: { label: "Cloud SQL", base: 25, sized: true },
  google_storage_bucket: { label: "GCS Bucket", base: 2 },
  google_container_cluster: { label: "GKE Cluster", base: 72 },
  google_container_node_pool: { label: "GKE Node Pool", base: 25, sized: true },
  google_cloud_run_service: { label: "Cloud Run", base: 2 },
  google_cloud_run_v2_service: { label: "Cloud Run", base: 2 },
  google_cloudfunctions_function: { label: "Cloud Functions", base: 1 },
  google_pubsub_topic: { label: "Pub/Sub Topic", base: 1 },
  google_bigquery_dataset: { label: "BigQuery Dataset", base: 5 },
  google_compute_global_forwarding_rule: { label: "Load Balancer", base: 18 },
  google_dns_managed_zone: { label: "Cloud DNS Zone", base: 1 },
  google_redis_instance: { label: "Memorystore (Redis)", base: 50, sized: true },
  google_bigtable_instance: { label: "Bigtable", base: 100 },
  google_spanner_instance: { label: "Cloud Spanner", base: 200 },
  google_secret_manager_secret: { label: "Secret Manager", base: 1 },
};

// Relative size factor parsed from an instance_type / sku string.
// Base rates above assume a "medium"/"large" reference (factor 1).
const SIZE_FACTORS = [
  [/nano/, 0.25],
  [/micro/, 0.4],
  [/\bsmall\b|_small|\.small/, 0.6],
  [/medium|\.med\b/, 1],
  [/24xlarge/, 48],
  [/18xlarge/, 36],
  [/16xlarge/, 32],
  [/12xlarge/, 24],
  [/10xlarge/, 20],
  [/9xlarge/, 18],
  [/8xlarge/, 16],
  [/4xlarge/, 8],
  [/2xlarge/, 4],
  [/xlarge/, 2],
  [/large/, 1.4],
];

function sizeFactor(size) {
  if (!size) return 1;
  const s = size.toLowerCase();
  for (const [re, f] of SIZE_FACTORS) if (re.test(s)) return f;
  // Azure-style "GP_Gen5_2" / "Standard_D2s_v3" → scale by trailing core count
  const cores = s.match(/_(\d{1,2})s?(?:_|$)|gen\d_(\d{1,2})/);
  if (cores) {
    const n = parseInt(cores[1] || cores[2], 10);
    if (Number.isFinite(n) && n > 0) return Math.max(0.5, n / 2);
  }
  return 1;
}

function tier(cost) {
  if (cost === 0) return { icon: "⬜", word: "Free" };
  if (cost < 5) return { icon: "🟢", word: "Low" };
  if (cost < 30) return { icon: "🟡", word: "Medium" };
  if (cost < 100) return { icon: "🟠", word: "High" };
  return { icon: "🔴", word: "Very high" };
}

const CALC_URL = {
  aws: "https://calculator.aws/pricing/2/calculator",
  azure: "https://azure.microsoft.com/en-us/pricing/calculator/",
  gcp: "https://cloud.google.com/products/calculator",
};

export default function CostBreakdown({ files = {}, resources = [], cloudProvider = "aws" }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(null); // { available, total_monthly, items, reason }
  const [liveState, setLiveState] = useState("idle"); // idle | loading | done

  const fetchLive = async () => {
    if (liveState === "loading") return;
    setLiveState("loading");
    try {
      const data = await getCostBreakdown(files);
      setLive(data);
    } catch (e) {
      setLive({ available: false, reason: e.message || "request failed" });
    } finally {
      setLiveState("done");
    }
  };

  const { items, total, source } = useMemo(() => {
    const blocks = parseResources(files);

    if (blocks.length) {
      // ── Accurate path: cost from the real Terraform code ──
      const map = {}; // label → { unit, count, lineCost, sizes:Set }
      for (const b of blocks) {
        const rate = RATES[b.type];
        if (!rate) continue; // unpriced / zero-cost infra (vpc, subnet, iam…)
        const count = readCount(b.body);
        const size = rate.sized ? readSize(b.body) : null;
        const factor = rate.sized ? sizeFactor(size) : 1;
        const unit = Math.round(rate.base * factor);
        const lineCost = unit * count;
        const key = rate.label;
        if (!map[key]) map[key] = { unit, count: 0, lineCost: 0, sizes: new Set() };
        map[key].count += count;
        map[key].lineCost += lineCost;
        map[key].unit = unit;
        if (size) map[key].sizes.add(size);
      }
      let total = 0;
      const items = Object.entries(map).map(([label, v]) => {
        total += v.lineCost;
        return { label, unit: v.unit, count: v.count, lineCost: v.lineCost, sizes: [...v.sizes] };
      });
      items.sort((a, b) => b.lineCost - a.lineCost);
      return { items, total, source: "code" };
    }

    // ── Fallback: name-based estimate (no parseable .tf) ──
    const map = {};
    for (const r of resources) {
      const t = r.includes(":") ? r.split(":")[0] : r;
      const rate = RATES[t];
      if (!rate) continue;
      const key = rate.label;
      if (!map[key]) map[key] = { unit: rate.base, count: 0, lineCost: 0, sizes: [] };
      map[key].count += 1;
      map[key].lineCost += rate.base;
    }
    let total = 0;
    const items = Object.entries(map).map(([label, v]) => {
      total += v.lineCost;
      return { label, unit: v.unit, count: v.count, lineCost: v.lineCost, sizes: [] };
    });
    items.sort((a, b) => b.lineCost - a.lineCost);
    return { items, total, source: "names" };
  }, [files, resources]);

  if (!items.length) return null;

  const calcUrl = CALC_URL[cloudProvider] || CALC_URL.aws;
  const providerLabel = cloudProvider === "aws" ? "AWS" : cloudProvider === "azure" ? "Azure" : "GCP";

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/[0.04]"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              Estimated Cost
              {source === "code" && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0 text-[10px] font-medium text-emerald-300">
                  from code
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400">
              ~<span className="font-semibold text-emerald-300">${total.toFixed(0)}</span>/month
            </p>
          </div>
        </div>
        <span className="text-lg text-slate-500">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-3">
          {/* Live Infracost pricing (opt-in) */}
          {live?.available ? (
            <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <span className="rounded-full bg-emerald-400/20 px-1.5 py-0 text-[10px] text-emerald-300">
                    Infracost · live
                  </span>
                  Cloud-API pricing
                </span>
                <span className="font-mono text-sm font-bold text-emerald-300">
                  ${live.total_monthly?.toFixed(0)}
                  <span className="text-[10px] font-normal text-emerald-400">/mo</span>
                </span>
              </div>
              {(live.items || []).slice(0, 8).map((it) => (
                <div key={it.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-slate-400">{it.name}</span>
                  <span className="shrink-0 font-mono text-slate-300">
                    {it.monthly ? `$${it.monthly}/mo` : "—"}
                  </span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-slate-500">
                The estimate below is a heuristic fallback.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <button
                type="button"
                onClick={fetchLive}
                disabled={liveState === "loading"}
                className="btn-secondary w-full justify-center py-2 text-xs disabled:opacity-60"
              >
                {liveState === "loading" ? "Fetching live prices…" : "Get live prices (Infracost)"}
              </button>
              {liveState === "done" && live && !live.available && (
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Live pricing unavailable ({live.reason || "not configured"}) — showing estimate.
                </p>
              )}
            </div>
          )}

          <p className="mb-3 text-[11px] text-slate-500">
            {source === "code"
              ? "Estimated from the actual resource blocks, counts and instance sizes in the generated Terraform. Excludes data transfer, storage volume and request-based charges."
              : "Rough estimate based on identified resources at default sizes."}
          </p>

          <div className="space-y-1.5">
            {items.map((item) => {
              const t = tier(item.unit);
              return (
                <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span title={t.word}>{t.icon}</span>
                    <span className="truncate text-slate-300">{item.label}</span>
                    {item.count > 1 && (
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0 text-[10px] text-slate-400">
                        ×{item.count}
                      </span>
                    )}
                    {item.sizes.length > 0 && (
                      <span className="shrink-0 truncate font-mono text-[10px] text-slate-500">
                        {item.sizes.join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-300">
                    {item.lineCost === 0 ? "free" : `$${item.lineCost}/mo`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5">
            <span className="text-sm font-semibold text-emerald-200">Total estimate</span>
            <span className="font-mono text-base font-bold text-emerald-300">
              ~${total.toFixed(0)}
              <span className="text-xs font-normal text-emerald-400">/mo</span>
            </span>
          </div>

          <p className="mt-2 text-[10px] text-slate-600">
            US on-demand pricing. Use the{" "}
            <a href={calcUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
              {providerLabel} Calculator
            </a>{" "}
            for exact quotes.
          </p>
        </div>
      )}
    </div>
  );
}
