import React, { useMemo, useState } from "react";

const AWS_PRICING = {
  aws_instance: { label: "EC2 Instance", cost: 30 },
  aws_db_instance: { label: "RDS Instance", cost: 60 },
  aws_rds_cluster: { label: "Aurora Cluster", cost: 175 },
  aws_lb: { label: "Load Balancer", cost: 16 },
  aws_alb: { label: "Application LB", cost: 16 },
  aws_s3_bucket: { label: "S3 Bucket", cost: 2 },
  aws_cloudfront_distribution: { label: "CloudFront", cost: 5 },
  aws_lambda_function: { label: "Lambda Function", cost: 1 },
  aws_elasticache_cluster: { label: "ElastiCache", cost: 13 },
  aws_elasticache_replication_group: { label: "ElastiCache Redis", cost: 50 },
  aws_eks_cluster: { label: "EKS Cluster", cost: 72 },
  aws_ecs_service: { label: "ECS Service (Fargate)", cost: 25 },
  aws_nat_gateway: { label: "NAT Gateway", cost: 32 },
  aws_api_gateway: { label: "API Gateway", cost: 3 },
  aws_dynamodb_table: { label: "DynamoDB Table", cost: 5 },
  aws_sqs_queue: { label: "SQS Queue", cost: 1 },
  aws_sns_topic: { label: "SNS Topic", cost: 1 },
  aws_route53_zone: { label: "Route 53 Zone", cost: 1 },
  aws_waf_web_acl: { label: "WAF Web ACL", cost: 5 },
  aws_kinesis_stream: { label: "Kinesis Stream", cost: 15 },
  aws_elasticsearch_domain: { label: "OpenSearch Domain", cost: 100 },
  aws_opensearch_domain: { label: "OpenSearch Domain", cost: 100 },
  aws_msk_cluster: { label: "MSK Cluster", cost: 200 },
  aws_ecr_repository: { label: "ECR Repository", cost: 1 },
  aws_cloudwatch_log_group: { label: "CloudWatch Logs", cost: 2 },
  aws_secretsmanager_secret: { label: "Secrets Manager", cost: 1 },
  aws_kms_key: { label: "KMS Key", cost: 1 },
  aws_vpc: { label: "VPC", cost: 0 },
  aws_subnet: { label: "Subnet", cost: 0 },
  aws_security_group: { label: "Security Group", cost: 0 },
  aws_iam_role: { label: "IAM Role", cost: 0 },
  aws_acm_certificate: { label: "ACM Certificate", cost: 0 },
  aws_autoscaling_group: { label: "Auto Scaling Group", cost: 0 },
  aws_ssm_parameter: { label: "SSM Parameter", cost: 0 },
  aws_route_table: { label: "Route Table", cost: 0 },
  aws_internet_gateway: { label: "Internet Gateway", cost: 0 },
};

const AZURE_PRICING = {
  azurerm_virtual_machine: { label: "Virtual Machine", cost: 30 },
  azurerm_linux_virtual_machine: { label: "Linux VM", cost: 30 },
  azurerm_windows_virtual_machine: { label: "Windows VM", cost: 50 },
  azurerm_sql_database: { label: "SQL Database", cost: 15 },
  azurerm_application_gateway: { label: "Application Gateway", cost: 25 },
  azurerm_lb: { label: "Load Balancer", cost: 5 },
  azurerm_storage_account: { label: "Storage Account", cost: 2 },
  azurerm_cdn_profile: { label: "CDN Profile", cost: 5 },
  azurerm_function_app: { label: "Function App", cost: 1 },
  azurerm_redis_cache: { label: "Redis Cache", cost: 25 },
  azurerm_kubernetes_cluster: { label: "AKS Cluster", cost: 72 },
  azurerm_container_app: { label: "Container App", cost: 10 },
  azurerm_cosmosdb_account: { label: "Cosmos DB", cost: 25 },
  azurerm_servicebus_namespace: { label: "Service Bus", cost: 10 },
  azurerm_eventhub_namespace: { label: "Event Hub", cost: 10 },
  azurerm_api_management: { label: "API Management", cost: 50 },
  azurerm_public_ip: { label: "Public IP", cost: 3 },
  azurerm_nat_gateway: { label: "NAT Gateway", cost: 32 },
  azurerm_key_vault: { label: "Key Vault", cost: 1 },
  azurerm_virtual_network: { label: "VNet", cost: 0 },
  azurerm_subnet: { label: "Subnet", cost: 0 },
  azurerm_network_security_group: { label: "NSG", cost: 0 },
  azurerm_sql_server: { label: "SQL Server", cost: 0 },
  azurerm_resource_group: { label: "Resource Group", cost: 0 },
};

const GCP_PRICING = {
  google_compute_instance: { label: "Compute Instance", cost: 25 },
  google_sql_database_instance: { label: "Cloud SQL", cost: 25 },
  google_storage_bucket: { label: "GCS Bucket", cost: 2 },
  google_container_cluster: { label: "GKE Cluster", cost: 72 },
  google_cloud_run_service: { label: "Cloud Run", cost: 2 },
  google_cloudfunctions_function: { label: "Cloud Functions", cost: 1 },
  google_pubsub_topic: { label: "Pub/Sub Topic", cost: 1 },
  google_bigquery_dataset: { label: "BigQuery Dataset", cost: 5 },
  google_compute_global_forwarding_rule: { label: "Load Balancer", cost: 18 },
  google_dns_managed_zone: { label: "Cloud DNS Zone", cost: 1 },
  google_redis_instance: { label: "Memorystore (Redis)", cost: 50 },
  google_bigtable_instance: { label: "Bigtable", cost: 100 },
  google_spanner_instance: { label: "Cloud Spanner", cost: 200 },
  google_artifact_registry_repository: { label: "Artifact Registry", cost: 1 },
  google_secret_manager_secret: { label: "Secret Manager", cost: 1 },
  google_vpc_access_connector: { label: "VPC Connector", cost: 7 },
  google_compute_network: { label: "VPC Network", cost: 0 },
  google_compute_subnetwork: { label: "Subnet", cost: 0 },
  google_compute_firewall: { label: "Firewall Rule", cost: 0 },
  google_compute_url_map: { label: "URL Map", cost: 0 },
  google_logging_project_sink: { label: "Cloud Logging", cost: 2 },
};

const PRICING_MAP = { aws: AWS_PRICING, azure: AZURE_PRICING, gcp: GCP_PRICING };

function getIcon(cost) {
  if (cost === 0) return "⬜";
  if (cost < 5) return "🟢";
  if (cost < 30) return "🟡";
  if (cost < 100) return "🟠";
  return "🔴";
}

export default function CostEstimator({ resources = [], cloudProvider = "aws" }) {
  const [open, setOpen] = useState(false);

  const { items, total, unknown } = useMemo(() => {
    const pricing = PRICING_MAP[cloudProvider] || AWS_PRICING;
    const counts = {};
    const unknownTypes = new Set();

    for (const r of resources) {
      const type = r.includes(":") ? r.split(":")[0] : r;
      counts[type] = (counts[type] || 0) + 1;
    }

    let total = 0;
    const items = [];
    for (const [type, count] of Object.entries(counts)) {
      const info = pricing[type];
      if (info) {
        const cost = info.cost * count;
        total += cost;
        items.push({ type, label: info.label, count, unitCost: info.cost, cost });
      } else {
        unknownTypes.add(type);
      }
    }
    items.sort((a, b) => b.cost - a.cost);
    return { items, total, unknown: [...unknownTypes] };
  }, [resources, cloudProvider]);

  if (resources.length === 0) return null;

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
                <div key={item.type} className="flex items-center justify-between gap-2 text-sm">
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
                    {item.cost === 0 ? "free" : `$${item.cost}/mo`}
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
              href="https://calculator.aws/pricing/2/calculator"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-400"
            >
              AWS Calculator
            </a>{" "}
            for exact quotes.
          </p>
        </div>
      )}
    </div>
  );
}
