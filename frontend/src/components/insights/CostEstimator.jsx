import React, { useMemo, useState } from "react";

// ── Pricing tables (Terraform type → label + $/mo) ─────────────────────────

const AWS_PRICING = {
  aws_instance:                       { label: "EC2 Instance",           cost: 30  },
  aws_db_instance:                    { label: "RDS Instance",            cost: 60  },
  aws_rds_cluster:                    { label: "Aurora Cluster",          cost: 175 },
  aws_lb:                             { label: "Load Balancer",           cost: 16  },
  aws_alb:                            { label: "Application LB",          cost: 16  },
  aws_s3_bucket:                      { label: "S3 Bucket",              cost: 2   },
  aws_cloudfront_distribution:        { label: "CloudFront",             cost: 5   },
  aws_lambda_function:                { label: "Lambda Function",         cost: 1   },
  aws_elasticache_cluster:            { label: "ElastiCache",            cost: 13  },
  aws_elasticache_replication_group:  { label: "ElastiCache Redis",      cost: 50  },
  aws_eks_cluster:                    { label: "EKS Cluster",            cost: 72  },
  aws_ecs_service:                    { label: "ECS Service (Fargate)",   cost: 25  },
  aws_nat_gateway:                    { label: "NAT Gateway",             cost: 32  },
  aws_api_gateway:                    { label: "API Gateway",             cost: 3   },
  aws_dynamodb_table:                 { label: "DynamoDB Table",          cost: 5   },
  aws_sqs_queue:                      { label: "SQS Queue",              cost: 1   },
  aws_sns_topic:                      { label: "SNS Topic",              cost: 1   },
  aws_route53_zone:                   { label: "Route 53 Zone",          cost: 1   },
  aws_waf_web_acl:                    { label: "WAF Web ACL",            cost: 5   },
  aws_kinesis_stream:                 { label: "Kinesis Stream",         cost: 15  },
  aws_elasticsearch_domain:           { label: "OpenSearch Domain",       cost: 100 },
  aws_opensearch_domain:              { label: "OpenSearch Domain",       cost: 100 },
  aws_msk_cluster:                    { label: "MSK Cluster",            cost: 200 },
  aws_ecr_repository:                 { label: "ECR Repository",         cost: 1   },
  aws_cloudwatch_log_group:           { label: "CloudWatch Logs",        cost: 2   },
  aws_secretsmanager_secret:          { label: "Secrets Manager",        cost: 1   },
  aws_kms_key:                        { label: "KMS Key",                cost: 1   },
  aws_vpc:                            { label: "VPC",                    cost: 0   },
  aws_subnet:                         { label: "Subnet",                 cost: 0   },
  aws_security_group:                 { label: "Security Group",         cost: 0   },
  aws_iam_role:                       { label: "IAM Role",               cost: 0   },
  aws_acm_certificate:                { label: "ACM Certificate",        cost: 0   },
  aws_autoscaling_group:              { label: "Auto Scaling Group",      cost: 0   },
  aws_ssm_parameter:                  { label: "SSM Parameter",          cost: 0   },
  aws_route_table:                    { label: "Route Table",             cost: 0   },
  aws_internet_gateway:               { label: "Internet Gateway",       cost: 0   },
};

const AZURE_PRICING = {
  azurerm_virtual_machine:            { label: "Virtual Machine",         cost: 30  },
  azurerm_linux_virtual_machine:      { label: "Linux VM",               cost: 30  },
  azurerm_windows_virtual_machine:    { label: "Windows VM",             cost: 50  },
  azurerm_sql_database:               { label: "SQL Database",           cost: 15  },
  azurerm_application_gateway:        { label: "Application Gateway",    cost: 25  },
  azurerm_lb:                         { label: "Load Balancer",          cost: 5   },
  azurerm_storage_account:            { label: "Storage Account",        cost: 2   },
  azurerm_cdn_profile:                { label: "CDN Profile",            cost: 5   },
  azurerm_function_app:               { label: "Function App",           cost: 1   },
  azurerm_redis_cache:                { label: "Redis Cache",            cost: 25  },
  azurerm_kubernetes_cluster:         { label: "AKS Cluster",            cost: 72  },
  azurerm_container_app:              { label: "Container App",          cost: 10  },
  azurerm_cosmosdb_account:           { label: "Cosmos DB",              cost: 25  },
  azurerm_servicebus_namespace:       { label: "Service Bus",            cost: 10  },
  azurerm_eventhub_namespace:         { label: "Event Hub",              cost: 10  },
  azurerm_api_management:             { label: "API Management",         cost: 50  },
  azurerm_public_ip:                  { label: "Public IP",              cost: 3   },
  azurerm_nat_gateway:                { label: "NAT Gateway",            cost: 32  },
  azurerm_key_vault:                  { label: "Key Vault",              cost: 1   },
  azurerm_virtual_network:            { label: "VNet",                   cost: 0   },
  azurerm_subnet:                     { label: "Subnet",                 cost: 0   },
  azurerm_network_security_group:     { label: "NSG",                    cost: 0   },
  azurerm_sql_server:                 { label: "SQL Server",             cost: 0   },
  azurerm_resource_group:             { label: "Resource Group",         cost: 0   },
};

const GCP_PRICING = {
  google_compute_instance:            { label: "Compute Instance",       cost: 25  },
  google_sql_database_instance:       { label: "Cloud SQL",              cost: 25  },
  google_storage_bucket:              { label: "GCS Bucket",             cost: 2   },
  google_container_cluster:           { label: "GKE Cluster",            cost: 72  },
  google_cloud_run_service:           { label: "Cloud Run",              cost: 2   },
  google_cloudfunctions_function:     { label: "Cloud Functions",        cost: 1   },
  google_pubsub_topic:                { label: "Pub/Sub Topic",          cost: 1   },
  google_bigquery_dataset:            { label: "BigQuery Dataset",       cost: 5   },
  google_compute_global_forwarding_rule: { label: "Load Balancer",       cost: 18  },
  google_dns_managed_zone:            { label: "Cloud DNS Zone",         cost: 1   },
  google_redis_instance:              { label: "Memorystore (Redis)",    cost: 50  },
  google_bigtable_instance:           { label: "Bigtable",              cost: 100 },
  google_spanner_instance:            { label: "Cloud Spanner",         cost: 200 },
  google_artifact_registry_repository:{ label: "Artifact Registry",     cost: 1   },
  google_secret_manager_secret:       { label: "Secret Manager",        cost: 1   },
  google_vpc_access_connector:        { label: "VPC Connector",         cost: 7   },
  google_compute_network:             { label: "VPC Network",            cost: 0   },
  google_compute_subnetwork:          { label: "Subnet",                 cost: 0   },
  google_compute_firewall:            { label: "Firewall Rule",          cost: 0   },
  google_compute_url_map:             { label: "URL Map",                cost: 0   },
  google_logging_project_sink:        { label: "Cloud Logging",         cost: 2   },
};

// ── Keyword-based fuzzy lookup (handles human-readable labels from v1) ──────

const AWS_KEYWORDS = [
  { keys: ["application load balancer", "alb", "elastic load balanc"],   label: "Application LB",         cost: 16  },
  { keys: ["network load balancer", "nlb"],                               label: "Network LB",             cost: 16  },
  { keys: ["classic load balancer", "elb"],                               label: "Load Balancer",          cost: 16  },
  { keys: ["nat gateway"],                                                 label: "NAT Gateway",            cost: 32  },
  { keys: ["internet gateway", "igw"],                                     label: "Internet Gateway",       cost: 0   },
  { keys: ["ec2", "web server", "app server", "application server", "compute instance"], label: "EC2 Instance", cost: 30 },
  { keys: ["auto scal"],                                                   label: "Auto Scaling Group",     cost: 0   },
  { keys: ["rds", "relational database", "mysql", "postgresql", "postgres", "mariadb", "oracle database"], label: "RDS Instance", cost: 60 },
  { keys: ["aurora"],                                                      label: "Aurora Cluster",         cost: 175 },
  { keys: ["dynamodb", "dynamo db"],                                       label: "DynamoDB Table",         cost: 5   },
  { keys: ["s3", "simple storage", "object storage"],                      label: "S3 Bucket",              cost: 2   },
  { keys: ["cloudfront", "content delivery network", "cdn"],               label: "CloudFront",             cost: 5   },
  { keys: ["lambda", "serverless function"],                               label: "Lambda Function",        cost: 1   },
  { keys: ["api gateway", "rest api", "http api"],                         label: "API Gateway",            cost: 3   },
  { keys: ["elasticache", "memcached"],                                    label: "ElastiCache",            cost: 13  },
  { keys: ["redis"],                                                       label: "ElastiCache Redis",      cost: 50  },
  { keys: ["eks", "elastic kubernetes"],                                   label: "EKS Cluster",            cost: 72  },
  { keys: ["ecs", "elastic container service", "fargate"],                 label: "ECS Service (Fargate)",  cost: 25  },
  { keys: ["kinesis"],                                                     label: "Kinesis Stream",         cost: 15  },
  { keys: ["opensearch", "elasticsearch"],                                 label: "OpenSearch Domain",      cost: 100 },
  { keys: ["msk", "managed streaming", "kafka"],                           label: "MSK Cluster",            cost: 200 },
  { keys: ["sqs", "simple queue", "message queue"],                        label: "SQS Queue",              cost: 1   },
  { keys: ["sns", "simple notification"],                                  label: "SNS Topic",              cost: 1   },
  { keys: ["route 53", "route53", "hosted zone"],                         label: "Route 53 Zone",          cost: 1   },
  { keys: ["waf", "web application firewall"],                             label: "WAF Web ACL",            cost: 5   },
  { keys: ["ecr", "container registry", "elastic container registry"],     label: "ECR Repository",         cost: 1   },
  { keys: ["cloudwatch", "cloud watch"],                                   label: "CloudWatch Logs",        cost: 2   },
  { keys: ["secrets manager", "secret manager"],                           label: "Secrets Manager",        cost: 1   },
  { keys: ["kms", "key management"],                                       label: "KMS Key",                cost: 1   },
  { keys: ["vpc", "virtual private cloud"],                                label: "VPC",                    cost: 0   },
  { keys: ["subnet"],                                                      label: "Subnet",                 cost: 0   },
  { keys: ["security group"],                                              label: "Security Group",         cost: 0   },
  { keys: ["iam role", "iam policy", "iam user", "identity and access"],   label: "IAM Role",               cost: 0   },
  { keys: ["acm", "ssl certificate", "tls certificate", "certificate manager"], label: "ACM Certificate",  cost: 0   },
  { keys: ["ssm", "parameter store", "systems manager"],                  label: "SSM Parameter",          cost: 0   },
  { keys: ["route table"],                                                 label: "Route Table",            cost: 0   },
];

const AZURE_KEYWORDS = [
  { keys: ["virtual machine", "vm "],                                      label: "Virtual Machine",        cost: 30  },
  { keys: ["sql database", "azure sql"],                                   label: "SQL Database",           cost: 15  },
  { keys: ["application gateway"],                                         label: "Application Gateway",    cost: 25  },
  { keys: ["load balancer"],                                               label: "Load Balancer",          cost: 5   },
  { keys: ["storage account", "blob storage"],                             label: "Storage Account",        cost: 2   },
  { keys: ["cdn", "content delivery"],                                     label: "CDN Profile",            cost: 5   },
  { keys: ["function app", "azure function"],                              label: "Function App",           cost: 1   },
  { keys: ["redis cache", "azure cache"],                                  label: "Redis Cache",            cost: 25  },
  { keys: ["aks", "kubernetes service", "kubernetes cluster"],             label: "AKS Cluster",            cost: 72  },
  { keys: ["container app"],                                               label: "Container App",          cost: 10  },
  { keys: ["cosmos", "cosmosdb"],                                          label: "Cosmos DB",              cost: 25  },
  { keys: ["service bus"],                                                 label: "Service Bus",            cost: 10  },
  { keys: ["event hub"],                                                   label: "Event Hub",              cost: 10  },
  { keys: ["api management"],                                              label: "API Management",         cost: 50  },
  { keys: ["key vault"],                                                   label: "Key Vault",              cost: 1   },
  { keys: ["virtual network", "vnet"],                                     label: "VNet",                   cost: 0   },
  { keys: ["subnet"],                                                      label: "Subnet",                 cost: 0   },
  { keys: ["network security group", "nsg"],                               label: "NSG",                    cost: 0   },
  { keys: ["resource group"],                                              label: "Resource Group",         cost: 0   },
  { keys: ["public ip"],                                                   label: "Public IP",              cost: 3   },
  { keys: ["nat gateway"],                                                 label: "NAT Gateway",            cost: 32  },
];

const GCP_KEYWORDS = [
  { keys: ["compute instance", "vm instance", "gce"],                      label: "Compute Instance",       cost: 25  },
  { keys: ["cloud sql", "sql instance"],                                   label: "Cloud SQL",              cost: 25  },
  { keys: ["gcs", "cloud storage", "storage bucket"],                      label: "GCS Bucket",             cost: 2   },
  { keys: ["gke", "kubernetes engine", "kubernetes cluster"],              label: "GKE Cluster",            cost: 72  },
  { keys: ["cloud run"],                                                   label: "Cloud Run",              cost: 2   },
  { keys: ["cloud function"],                                              label: "Cloud Functions",        cost: 1   },
  { keys: ["pub/sub", "pubsub", "pub sub"],                                label: "Pub/Sub Topic",          cost: 1   },
  { keys: ["bigquery"],                                                    label: "BigQuery Dataset",       cost: 5   },
  { keys: ["load balancer", "forwarding rule"],                            label: "Load Balancer",          cost: 18  },
  { keys: ["cloud dns"],                                                   label: "Cloud DNS Zone",         cost: 1   },
  { keys: ["memorystore", "redis"],                                        label: "Memorystore (Redis)",    cost: 50  },
  { keys: ["bigtable"],                                                    label: "Bigtable",               cost: 100 },
  { keys: ["spanner"],                                                     label: "Cloud Spanner",          cost: 200 },
  { keys: ["artifact registry"],                                           label: "Artifact Registry",      cost: 1   },
  { keys: ["secret manager"],                                              label: "Secret Manager",         cost: 1   },
  { keys: ["vpc", "virtual private cloud", "vpc network"],                 label: "VPC Network",            cost: 0   },
  { keys: ["subnet"],                                                      label: "Subnet",                 cost: 0   },
  { keys: ["firewall"],                                                    label: "Firewall Rule",          cost: 0   },
];

const KEYWORD_MAP = { aws: AWS_KEYWORDS, azure: AZURE_KEYWORDS, gcp: GCP_KEYWORDS };
const PRICING_MAP  = { aws: AWS_PRICING,  azure: AZURE_PRICING,  gcp: GCP_PRICING  };

// ── Core lookup: exact Terraform type first, then keyword fuzzy match ────────

function lookupResource(raw, pricing, keywords) {
  // 1. Exact Terraform type match ("aws_instance:web_server" or "aws_instance")
  const tfType = raw.includes(":") ? raw.split(":")[0] : raw;
  if (pricing[tfType]) {
    return { label: pricing[tfType].label, cost: pricing[tfType].cost };
  }

  // 2. Keyword fuzzy match (handles human-readable strings from v1)
  const lower = raw.toLowerCase();
  for (const entry of keywords) {
    if (entry.keys.some((k) => lower.includes(k))) {
      return { label: entry.label, cost: entry.cost };
    }
  }

  return null;
}

function getIcon(cost) {
  if (cost === 0)   return "⬜";
  if (cost < 5)     return "🟢";
  if (cost < 30)    return "🟡";
  if (cost < 100)   return "🟠";
  return "🔴";
}

export default function CostEstimator({ resources = [], cloudProvider = "aws" }) {
  const [open, setOpen] = useState(false);

  const { items, total, unknown } = useMemo(() => {
    const pricing  = PRICING_MAP[cloudProvider]  || AWS_PRICING;
    const keywords = KEYWORD_MAP[cloudProvider]  || AWS_KEYWORDS;

    // Aggregate by display label so duplicates are counted correctly
    const labelMap = {};   // label → { cost, count }
    const unknownList = [];

    for (const r of resources) {
      const result = lookupResource(r, pricing, keywords);
      if (result) {
        const key = result.label;
        if (labelMap[key]) {
          labelMap[key].count += 1;
        } else {
          labelMap[key] = { cost: result.cost, count: 1 };
        }
      } else {
        // Strip Terraform prefix for display in the unknown list
        const display = r.includes(":") ? r.split(":")[1] || r : r;
        unknownList.push(display);
      }
    }

    let total = 0;
    const items = Object.entries(labelMap).map(([label, { cost, count }]) => {
      const lineCost = cost * count;
      total += lineCost;
      return { label, cost, count, lineCost };
    });
    items.sort((a, b) => b.lineCost - a.lineCost);

    return { items, total, unknown: unknownList };
  }, [resources, cloudProvider]);

  if (resources.length === 0) return null;

  const calcUrl = {
    aws:   "https://calculator.aws/pricing/2/calculator",
    azure: "https://azure.microsoft.com/en-us/pricing/calculator/",
    gcp:   "https://cloud.google.com/products/calculator",
  }[cloudProvider] || "https://calculator.aws/pricing/2/calculator";

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
            <p className="text-sm font-semibold text-slate-100">Estimated Cost</p>
            <p className="text-xs text-slate-400">
              ~<span className="font-semibold text-emerald-300">${total.toFixed(0)}</span>/month
            </p>
          </div>
        </div>
        <span className="text-slate-500 text-lg">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-3">
          <p className="mb-3 text-[11px] text-slate-500">
            Rough estimate based on default instance sizes. Actual cost depends on usage, region, and reserved pricing.
          </p>

          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span title={item.cost === 0 ? "Free" : item.cost < 5 ? "Low" : item.cost < 30 ? "Medium" : item.cost < 100 ? "High" : "Very high"}>
                      {getIcon(item.cost)}
                    </span>
                    <span className="truncate text-slate-300">{item.label}</span>
                    {item.count > 1 && (
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0 text-[10px] text-slate-400">×{item.count}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-300">
                    {item.lineCost === 0 ? "free" : `$${item.lineCost}/mo`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {unknown.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-600">
              Not priced: {unknown.join(", ")}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5">
            <span className="text-sm font-semibold text-emerald-200">Total estimate</span>
            <span className="font-mono text-base font-bold text-emerald-300">
              ~${total.toFixed(0)}<span className="text-xs font-normal text-emerald-400">/mo</span>
            </span>
          </div>

          <p className="mt-2 text-[10px] text-slate-600">
            Prices are US-East-1 on-demand. Use{" "}
            <a
              href={calcUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-400"
            >
              {cloudProvider === "aws" ? "AWS" : cloudProvider === "azure" ? "Azure" : "GCP"} Calculator
            </a>{" "}
            for exact quotes.
          </p>
        </div>
      )}
    </div>
  );
}
