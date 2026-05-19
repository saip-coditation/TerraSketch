import React, { useMemo, useState } from "react";

// ── Cost optimization rules ──────────────────────────────────────────────────
// Each rule tests the HCL text + resource list and returns a recommendation.

const RULES = [
  // ── Compute ─────────────────────────────────────────────────────────────
  {
    id: "spot_instances",
    category: "Compute",
    title: "Use Spot / Preemptible instances",
    saving: "high",
    savingLabel: "Up to 90% cheaper",
    description:
      "Non-production workloads (dev/staging) can run on Spot (AWS), Preemptible (GCP), or Spot VM (Azure) instances at a fraction of on-demand cost.",
    action: 'Add lifecycle { instance_interruption_behavior = "terminate" } and set instance_market_options { market_type = "spot" } on aws_instance, or use aws_spot_instance_request.',
    test: ({ hcl, env }) =>
      env !== "production" &&
      /resource\s+"aws_instance"/.test(hcl) &&
      !/spot_price|market_type\s*=\s*"spot"|aws_spot_instance_request/.test(hcl),
  },
  {
    id: "autoscaling",
    category: "Compute",
    title: "Add Auto Scaling to match demand",
    saving: "high",
    savingLabel: "30–60% reduction",
    description:
      "Fixed-size EC2 / VM fleets overprovision during off-peak hours. Auto Scaling Groups scale in during quiet periods and out under load.",
    action:
      "Replace standalone aws_instance resources with an aws_autoscaling_group backed by a launch template. Set min_size, max_size, and a target-tracking scaling policy.",
    test: ({ hcl }) =>
      /resource\s+"aws_instance"/.test(hcl) &&
      !/aws_autoscaling_group|aws_launch_template/.test(hcl),
  },
  {
    id: "reserved_instances",
    category: "Compute",
    title: "Commit to Reserved Instances / Savings Plans",
    saving: "high",
    savingLabel: "Up to 72% vs on-demand",
    description:
      "Steady-state production workloads benefit from 1- or 3-year Reserved Instance commitments or Compute Savings Plans (AWS). Equivalent offers exist on Azure (Reserved VM Instances) and GCP (Committed Use Discounts).",
    action:
      "Purchase reservations via the AWS/Azure/GCP console for your baseline capacity. Terraform manages the deployment; billing commitments are separate.",
    test: ({ hcl, env }) =>
      env === "production" &&
      /resource\s+"aws_instance"|resource\s+"azurerm_linux_virtual_machine"|resource\s+"google_compute_instance"/.test(hcl),
  },
  {
    id: "gp3_volumes",
    category: "Compute",
    title: "Upgrade EBS volumes from gp2 to gp3",
    saving: "medium",
    savingLabel: "~20% cheaper per GB",
    description:
      "gp3 volumes deliver the same baseline IOPS as gp2 at 20% lower cost. You can also independently tune IOPS and throughput without paying for extra capacity.",
    action: 'Change volume_type = "gp2" to volume_type = "gp3" in every aws_ebs_volume and root_block_device block.',
    test: ({ hcl }) => /volume_type\s*=\s*"gp2"/.test(hcl),
  },
  // ── Database ─────────────────────────────────────────────────────────────
  {
    id: "rds_multi_az_dev",
    category: "Database",
    title: "Disable RDS Multi-AZ in dev/staging",
    saving: "high",
    savingLabel: "50% RDS cost",
    description:
      "multi_az = true doubles your RDS bill by maintaining a synchronous standby replica. For non-production databases this is unnecessary.",
    action: 'Set multi_az = false on aws_db_instance for dev and staging environments.',
    test: ({ hcl, env }) =>
      env !== "production" &&
      /multi_az\s*=\s*true/.test(hcl),
  },
  {
    id: "rds_serverless",
    category: "Database",
    title: "Consider Aurora Serverless for variable workloads",
    saving: "medium",
    savingLabel: "Pay-per-ACU",
    description:
      "If database usage is intermittent or highly variable, Aurora Serverless v2 scales down to 0.5 ACU when idle instead of billing a fixed instance size.",
    action:
      "Replace aws_db_instance with aws_rds_cluster (engine = aurora-mysql or aurora-postgresql) and set serverlessv2_scaling_configuration { min_capacity, max_capacity }.",
    test: ({ hcl }) =>
      /resource\s+"aws_db_instance"/.test(hcl) &&
      !/serverlessv2_scaling_configuration|aws_rds_cluster/.test(hcl),
  },
  {
    id: "elasticache_reserved",
    category: "Database",
    title: "Use ElastiCache Reserved Nodes",
    saving: "medium",
    savingLabel: "Up to 55% off",
    description:
      "ElastiCache Reserved Nodes (1- or 3-year) offer significant discounts over on-demand pricing for steady-state caching clusters.",
    action:
      "Purchase Reserved Nodes in the AWS console for each cache.node_type you run. No Terraform change needed for the reservation itself.",
    test: ({ hcl }) => /resource\s+"aws_elasticache_cluster"|resource\s+"aws_elasticache_replication_group"/.test(hcl),
  },
  // ── Network ──────────────────────────────────────────────────────────────
  {
    id: "nat_gateway_dev",
    category: "Network",
    title: "Replace NAT Gateways with a NAT instance in dev",
    saving: "high",
    savingLabel: "~$32/mo → ~$5/mo per AZ",
    description:
      "AWS NAT Gateways cost $0.045/hr ($32.40/mo) plus data-processing charges. A small EC2 NAT instance (t4g.nano) handles dev-level traffic at a fraction of that cost.",
    action:
      "Set ami to an official NAT AMI, enable source_dest_check = false, and route 0.0.0.0/0 from private subnets to the instance instead of aws_nat_gateway.",
    test: ({ hcl, env }) =>
      env !== "production" &&
      /resource\s+"aws_nat_gateway"/.test(hcl),
  },
  {
    id: "data_transfer",
    category: "Network",
    title: "Enable CloudFront compression to cut data-transfer costs",
    saving: "medium",
    savingLabel: "20–60% bandwidth",
    description:
      "CloudFront can compress text responses (Gzip / Brotli) before delivery. This reduces origin-to-CloudFront data transfer and viewer download size.",
    action:
      'Add compress = true to the default_cache_behavior block in your aws_cloudfront_distribution.',
    test: ({ hcl }) =>
      /resource\s+"aws_cloudfront_distribution"/.test(hcl) &&
      !/compress\s*=\s*true/.test(hcl),
  },
  {
    id: "vpc_endpoints",
    category: "Network",
    title: "Add VPC endpoints to avoid NAT charges for AWS APIs",
    saving: "medium",
    savingLabel: "Saves data-processing fees",
    description:
      "Traffic from private subnets to S3 or DynamoDB routes through NAT Gateways by default, incurring data-processing charges. Gateway VPC endpoints are free and bypass NAT entirely.",
    action:
      "Add aws_vpc_endpoint resources with service_name = \"com.amazonaws.<region>.s3\" (type = Gateway) and route_table_ids pointing to your private route tables.",
    test: ({ hcl }) =>
      /resource\s+"aws_nat_gateway"/.test(hcl) &&
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/aws_vpc_endpoint/.test(hcl),
  },
  // ── Storage ──────────────────────────────────────────────────────────────
  {
    id: "s3_lifecycle",
    category: "Storage",
    title: "Add S3 lifecycle rules to tier old objects",
    saving: "medium",
    savingLabel: "40–90% on aging data",
    description:
      "Objects not accessed after 30–90 days can be transitioned to S3-IA ($0.0125/GB) or Glacier ($0.004/GB) instead of staying in Standard ($0.023/GB).",
    action:
      "Add an aws_s3_bucket_lifecycle_configuration resource with transition rules: Standard → Standard-IA at 30 days → Glacier at 90 days → delete at 365 days (adjust to your retention policy).",
    test: ({ hcl }) =>
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/aws_s3_bucket_lifecycle_configuration|lifecycle_rule/.test(hcl),
  },
  {
    id: "s3_intelligent_tiering",
    category: "Storage",
    title: "Enable S3 Intelligent-Tiering for unpredictable access",
    saving: "low",
    savingLabel: "Automatic tiering, no retrieval fees",
    description:
      "Intelligent-Tiering monitors access patterns and automatically moves objects between Frequent and Infrequent Access tiers, with optional Archive tiers for objects not accessed in 90+ days.",
    action:
      'Set storage_class = "INTELLIGENT_TIERING" in your lifecycle transition, or enable it as the default storage class on the bucket.',
    test: ({ hcl }) =>
      /resource\s+"aws_s3_bucket"/.test(hcl) &&
      !/INTELLIGENT_TIERING/.test(hcl),
  },
  // ── Serverless / Containers ───────────────────────────────────────────────
  {
    id: "lambda_arm",
    category: "Compute",
    title: "Switch Lambda functions to arm64 (Graviton2)",
    saving: "medium",
    savingLabel: "20% cheaper + faster",
    description:
      "AWS charges 20% less per GB-second for arm64 Lambda functions, and Graviton2 often executes faster, compounding the savings.",
    action: 'Set architectures = ["arm64"] on every aws_lambda_function.',
    test: ({ hcl }) =>
      /resource\s+"aws_lambda_function"/.test(hcl) &&
      !/architectures\s*=\s*\[.*arm64.*\]/.test(hcl),
  },
  {
    id: "fargate_spot",
    category: "Compute",
    title: "Use Fargate Spot for non-critical ECS tasks",
    saving: "high",
    savingLabel: "Up to 70% cheaper",
    description:
      "Fargate Spot runs tasks on spare capacity at heavily discounted rates. Suitable for batch jobs, background workers, or fault-tolerant services.",
    action:
      'Add a capacity_provider_strategy block with capacity_provider = "FARGATE_SPOT" and weight = 1 to your aws_ecs_service.',
    test: ({ hcl, env }) =>
      env !== "production" &&
      /resource\s+"aws_ecs_service"/.test(hcl) &&
      !/FARGATE_SPOT/.test(hcl),
  },
];

const SAVING_META = {
  high:   { label: "High savings",   color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
  medium: { label: "Medium savings", color: "text-brand-300",   bg: "bg-brand-500/10 border-brand-500/20" },
  low:    { label: "Low savings",    color: "text-amber-300",   bg: "bg-amber-500/10 border-amber-500/20" },
};

const CATEGORY_ICONS = {
  Compute:  "⚙️",
  Database: "🗄️",
  Network:  "🌐",
  Storage:  "💾",
};

function ChevronIcon({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RecommendationRow({ rec }) {
  const [open, setOpen] = useState(false);
  const meta = SAVING_META[rec.saving];

  return (
    <div className={`rounded-lg border ${meta.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <span className="mt-0.5 text-base">{CATEGORY_ICONS[rec.category] || "💡"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-100 leading-snug">{rec.title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color} bg-black/20`}>
              {rec.savingLabel}
            </span>
          </div>
          <span className="mt-0.5 text-[11px] text-slate-400">{rec.category}</span>
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 pb-3 pt-2.5 space-y-2">
          <p className="text-xs text-slate-300 leading-relaxed">{rec.description}</p>
          <div className="rounded-md bg-black/30 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">How to apply</p>
            <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">{rec.action}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CostOptimizer({ files = {}, resources = [], cloudProvider = "aws", environment = "dev" }) {
  const recommendations = useMemo(() => {
    const hcl = Object.values(files).join("\n");
    const ctx = { hcl, resources, env: environment, provider: cloudProvider };
    return RULES.filter((r) => {
      try { return r.test(ctx); } catch { return false; }
    });
  }, [files, resources, cloudProvider, environment]);

  const highCount = recommendations.filter((r) => r.saving === "high").length;
  const medCount  = recommendations.filter((r) => r.saving === "medium").length;
  const lowCount  = recommendations.filter((r) => r.saving === "low").length;

  const [expanded, setExpanded] = useState(true);

  if (recommendations.length === 0) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">💰</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Cost Optimizer
          </h3>
        </div>
        <p className="text-xs text-emerald-300 mt-1">
          No cost optimizations detected — your configuration looks efficient!
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-base">💰</span>
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-300">
          Cost Optimizer
        </h3>
        <div className="flex items-center gap-1.5 mr-1">
          {highCount > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              {highCount} high
            </span>
          )}
          {medCount > 0 && (
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
              {medCount} med
            </span>
          )}
          {lowCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {lowCount} low
            </span>
          )}
        </div>
        <ChevronIcon open={expanded} />
      </button>

      <p className="mt-1 text-[11px] text-slate-500">
        {recommendations.length} optimization{recommendations.length !== 1 ? "s" : ""} found based on your generated Terraform.
      </p>

      {expanded && (
        <div className="mt-3 space-y-2">
          {["high", "medium", "low"].map((sev) => {
            const group = recommendations.filter((r) => r.saving === sev);
            return group.map((rec) => <RecommendationRow key={rec.id} rec={rec} />);
          })}
        </div>
      )}
    </div>
  );
}
