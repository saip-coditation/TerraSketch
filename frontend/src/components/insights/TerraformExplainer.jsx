import React, { useMemo, useState } from "react";

// ── Resource explanation database ──────────────────────────────────────────

const RESOURCE_EXPLANATIONS = {
  // AWS Networking
  aws_vpc: (id) => `Creates an isolated virtual network (${id}) in AWS. All other resources live inside this VPC. The CIDR block defines the IP address range available to all subnets within it.`,
  aws_subnet: (id) => `Defines a subnet (${id}) inside the VPC. Subnets segment the VPC into smaller ranges — public subnets have internet access via an IGW, private subnets do not.`,
  aws_internet_gateway: (id) => `Attaches an internet gateway (${id}) to the VPC, enabling resources in public subnets to send and receive traffic from the internet.`,
  aws_nat_gateway: (id) => `Provides outbound-only internet access for resources in private subnets. Resources can initiate connections out but cannot be reached from the internet.`,
  aws_route_table: (id) => `Defines routing rules (${id}) for subnets. A route to 0.0.0.0/0 via the IGW makes traffic internet-routable; routes via NAT keep subnets private.`,
  aws_route_table_association: (id) => `Associates a route table with a subnet (${id}), applying its routing rules to all resources in that subnet.`,
  aws_route: (id) => `Adds a specific route entry (${id}) to a route table. Usually a default route (0.0.0.0/0) pointing to an IGW or NAT Gateway.`,
  aws_security_group: (id) => `Acts as a virtual firewall (${id}) controlling inbound and outbound traffic for EC2 instances, RDS, and other services. Rules specify port, protocol, and source/destination CIDR.`,
  aws_security_group_rule: (id) => `Adds a single inbound or outbound rule to a security group (${id}).`,

  // AWS Compute
  aws_instance: (id) => `Launches an EC2 virtual machine (${id}). Configuration includes the AMI (OS image), instance type (CPU/RAM), subnet placement, and attached storage volumes.`,
  aws_launch_template: (id) => `Defines a reusable configuration template (${id}) for EC2 instances — AMI, instance type, user data, security groups — used by Auto Scaling Groups.`,
  aws_autoscaling_group: (id) => `Manages a fleet of EC2 instances (${id}) that automatically scales in/out based on demand. Uses a launch template or configuration to define each instance.`,
  aws_lambda_function: (id) => `Deploys a serverless function (${id}) that runs on-demand without managing servers. Triggered by events like API Gateway requests, S3 uploads, or SQS messages.`,
  aws_ecs_cluster: (id) => `Creates an ECS cluster (${id}) — a logical grouping of container compute capacity (EC2 or Fargate).`,
  aws_ecs_service: (id) => `Runs and maintains a desired count of ECS task instances (${id}). Integrates with ALB for load balancing and auto-replaces unhealthy tasks.`,
  aws_ecs_task_definition: (id) => `Defines a container blueprint (${id}) — Docker image, CPU/memory, port mappings, environment variables, and IAM task role.`,
  aws_eks_cluster: (id) => `Provisions a managed Kubernetes control plane (${id}). Worker nodes run in node groups and are registered automatically.`,
  aws_eks_node_group: (id) => `Creates a managed group of EC2 worker nodes (${id}) that join the EKS cluster. Handles node lifecycle, scaling, and upgrades.`,

  // AWS Load Balancing
  aws_lb: (id) => `Provisions an Application or Network Load Balancer (${id}) that distributes incoming traffic across multiple targets (EC2, ECS, Lambda).`,
  aws_alb: (id) => `Provisions an Application Load Balancer (${id}) for HTTP/HTTPS traffic routing with path-based and host-based rules.`,
  aws_lb_listener: (id) => `Configures how the ALB handles incoming requests (${id}) — port, protocol, SSL certificate, and default action (forward/redirect).`,
  aws_lb_target_group: (id) => `Defines a group of targets (${id}) (EC2, IPs, Lambda) that the ALB routes traffic to, with health check configuration.`,
  aws_alb_listener: (id) => `Configures how the ALB handles incoming requests (${id}) — port, protocol, SSL certificate, and default action (forward/redirect).`,
  aws_alb_target_group: (id) => `Defines a group of targets (${id}) that the ALB routes traffic to, with health check settings.`,

  // AWS Storage
  aws_s3_bucket: (id) => `Creates an S3 object storage bucket (${id}). Used for static files, backups, data lakes, or deployment artifacts. Encryption and versioning can be enabled per bucket.`,
  aws_s3_bucket_lifecycle_configuration: (id) => `Defines automated lifecycle rules (${id}) for S3 objects — e.g., transition to cheaper storage classes after N days, or auto-delete after expiry.`,
  aws_s3_bucket_policy: (id) => `Attaches a bucket policy (${id}) controlling cross-account or public access permissions to S3 objects via IAM policy JSON.`,
  aws_s3_bucket_acl: (id) => `Sets the Access Control List (${id}) for the S3 bucket (private, public-read, etc.).`,
  aws_s3_bucket_versioning: (id) => `Enables versioning (${id}) on the S3 bucket so every object change is tracked and previous versions can be restored.`,
  aws_s3_bucket_server_side_encryption_configuration: (id) => `Enables server-side encryption (${id}) on the S3 bucket using AES-256 or AWS KMS keys.`,

  // AWS Database
  aws_db_instance: (id) => `Launches a managed RDS database instance (${id}). Handles backups, patching, failover, and multi-AZ replication automatically.`,
  aws_rds_cluster: (id) => `Creates an Aurora database cluster (${id}). Aurora is MySQL/PostgreSQL-compatible with up to 5x the performance, auto-scaling storage, and global replication.`,
  aws_rds_cluster_instance: (id) => `Adds a reader or writer instance (${id}) to an Aurora cluster. Add multiple reader instances for read scaling.`,
  aws_dynamodb_table: (id) => `Creates a DynamoDB NoSQL table (${id}) with millisecond latency at any scale. Define partition key and optional sort key; choose on-demand or provisioned capacity.`,
  aws_elasticache_cluster: (id) => `Provisions an ElastiCache Redis or Memcached cluster (${id}) for in-memory caching — dramatically reduces database load for repeated queries.`,
  aws_elasticache_replication_group: (id) => `Creates a Redis replication group (${id}) with primary and replica nodes for high availability and read scaling.`,

  // AWS Security & IAM
  aws_iam_role: (id) => `Creates an IAM role (${id}) that AWS services (EC2, Lambda, ECS) can assume. Attach policies to grant specific permissions without using long-term credentials.`,
  aws_iam_policy: (id) => `Defines a reusable set of permissions (${id}) in IAM policy JSON format — which AWS actions are allowed on which resources.`,
  aws_iam_role_policy_attachment: (id) => `Attaches a managed IAM policy to an IAM role (${id}), granting the role the permissions defined in that policy.`,
  aws_iam_instance_profile: (id) => `Wraps an IAM role (${id}) so EC2 instances can assume it at launch, enabling the instance to call AWS APIs without hardcoded credentials.`,
  aws_kms_key: (id) => `Creates a Customer Managed Key (${id}) in AWS KMS for encrypting S3 data, RDS storage, secrets, and more. Enables full key rotation control.`,
  aws_secretsmanager_secret: (id) => `Stores a secret (${id}) — database password, API key, etc. — in AWS Secrets Manager with automatic rotation and fine-grained access control.`,
  aws_acm_certificate: (id) => `Requests an SSL/TLS certificate (${id}) from AWS Certificate Manager. Used with CloudFront, ALB, and API Gateway for HTTPS.`,
  aws_wafv2_web_acl: (id) => `Creates a WAF Web ACL (${id}) with rules to block SQL injection, XSS, rate limiting, and AWS managed rule groups. Attaches to CloudFront or ALB.`,

  // AWS CDN & DNS
  aws_cloudfront_distribution: (id) => `Creates a CloudFront CDN distribution (${id}) that caches content at global edge locations, reducing latency and origin load. Supports multiple origins (S3 + ALB).`,
  aws_route53_zone: (id) => `Creates a Route53 hosted zone (${id}) for managing DNS records of a domain.`,
  aws_route53_record: (id) => `Adds a DNS record (${id}) to a Route53 hosted zone — A, AAAA, CNAME, or alias records pointing to AWS resources.`,

  // AWS Messaging
  aws_sqs_queue: (id) => `Creates an SQS message queue (${id}) for decoupling services. Messages persist until consumed; DLQ captures failed messages for debugging.`,
  aws_sns_topic: (id) => `Creates an SNS topic (${id}) for fan-out pub/sub messaging — one message triggers multiple subscribers (SQS, Lambda, email, HTTPS endpoints).`,
  aws_sns_topic_subscription: (id) => `Subscribes an endpoint (${id}) (SQS queue, Lambda, email) to an SNS topic to receive published messages.`,

  // Azure
  azurerm_resource_group: (id) => `Creates an Azure Resource Group (${id}) — a logical container for all related Azure resources. Enables unified billing, access control, and lifecycle management.`,
  azurerm_virtual_network: (id) => `Creates an Azure Virtual Network (${id}) — the fundamental networking building block for private communication between Azure resources.`,
  azurerm_subnet: (id) => `Defines a subnet (${id}) within a VNet for segmenting resources. Different subnets can host app, database, and gateway tiers with separate NSG rules.`,
  azurerm_network_security_group: (id) => `Creates an NSG (${id}) with inbound/outbound security rules controlling traffic to Azure resources, similar to AWS Security Groups.`,
  azurerm_public_ip: (id) => `Allocates a public IP address (${id}) for Azure resources that need internet-facing connectivity.`,
  azurerm_linux_virtual_machine: (id) => `Provisions a Linux VM (${id}) in Azure with specified size, image, disk, and networking. Managed disks provide persistent storage.`,
  azurerm_app_service_plan: (id) => `Defines the compute resources (${id}) for Azure App Service — OS, region, pricing tier, and instance count.`,
  azurerm_app_service: (id) => `Deploys a web application (${id}) on App Service PaaS — handles scaling, SSL, custom domains, and deployment slots without managing VMs.`,
  azurerm_sql_server: (id) => `Creates an Azure SQL logical server (${id}) that hosts one or more SQL databases with centralized login management.`,
  azurerm_sql_database: (id) => `Creates a managed SQL Database (${id}) on Azure with automatic backups, scaling, and high availability built in.`,
  azurerm_storage_account: (id) => `Creates an Azure Storage Account (${id}) for blobs, queues, tables, and files. Supports LRS/GRS redundancy and lifecycle management.`,
  azurerm_key_vault: (id) => `Provisions Azure Key Vault (${id}) for storing secrets, certificates, and encryption keys with RBAC-based access control.`,
  azurerm_kubernetes_cluster: (id) => `Deploys an AKS managed Kubernetes cluster (${id}). Azure manages the control plane; you manage node pools and workloads.`,

  // GCP
  google_compute_network: (id) => `Creates a GCP VPC network (${id}). GCP uses a global VPC model — a single VPC spans all regions, with subnets defined per-region.`,
  google_compute_subnetwork: (id) => `Creates a regional subnet (${id}) within the GCP VPC. Assign primary IP ranges for VMs and secondary ranges for GKE pods/services.`,
  google_compute_firewall: (id) => `Defines a GCP firewall rule (${id}) controlling ingress/egress traffic by protocol, port, and source/destination IP or service account tag.`,
  google_compute_instance: (id) => `Launches a GCE VM instance (${id}) with specified machine type, boot disk image, and network interface.`,
  google_container_cluster: (id) => `Provisions a GKE Kubernetes cluster (${id}). Autopilot mode manages nodes automatically; Standard mode gives full node control.`,
  google_container_node_pool: (id) => `Creates a node pool (${id}) for a GKE cluster — defines machine type, disk size, autoscaling min/max, and node labels.`,
  google_cloud_run_service: (id) => `Deploys a container as a Cloud Run service (${id}) — serverless, scales to zero, auto-HTTPS. Ideal for stateless APIs and microservices.`,
  google_sql_database_instance: (id) => `Creates a Cloud SQL managed database instance (${id}) for MySQL, PostgreSQL, or SQL Server with automatic backups and HA.`,
  google_storage_bucket: (id) => `Creates a GCS bucket (${id}) for object storage. Set location, storage class, lifecycle rules, and access control.`,
  google_pubsub_topic: (id) => `Creates a Pub/Sub topic (${id}) for asynchronous messaging between services. Messages are durably retained until acknowledged by subscribers.`,
  google_pubsub_subscription: (id) => `Creates a Pub/Sub subscription (${id}) — pull or push — to consume messages from a topic.`,
  google_secret_manager_secret: (id) => `Stores a secret (${id}) in GCP Secret Manager with version control and IAM-based access policy.`,
};

function getExplanation(resourceType, localId) {
  const fn = RESOURCE_EXPLANATIONS[resourceType];
  if (fn) return fn(localId.replace(/_/g, " "));
  const stripped = resourceType.replace(/^(aws_|azurerm_|google_)/, "").replace(/_/g, " ");
  return `Provisions a ${stripped} resource named "${localId.replace(/_/g, " ")}". Review the Terraform configuration to understand the specific settings applied.`;
}

// ── File parser ─────────────────────────────────────────────────────────────

function parseResourceBlocks(hcl) {
  const blocks = [];
  const re = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = re.exec(hcl)) !== null) {
    const type = m[1];
    const id = m[2];
    const body = m[3];

    // Extract key attributes for display
    const attrs = {};
    const attrRe = /^\s*([\w]+)\s*=\s*"?([^"\n\r{}]+)"?\s*$/gm;
    let am;
    while ((am = attrRe.exec(body)) !== null) {
      const key = am[1];
      const val = am[2].trim().replace(/^"(.*)"$/, "$1");
      if (!["source", "version"].includes(key)) attrs[key] = val;
    }

    blocks.push({ type, id, attrs, explanation: getExplanation(type, id) });
  }
  return blocks;
}

// ── File-level summaries ──────────────────────────────────────────────────

const FILE_SUMMARIES = {
  "main.tf": "Contains all resource definitions — the actual infrastructure components to be created. This is the primary file that Terraform reads to provision your cloud resources.",
  "variables.tf": "Declares all input variables that parameterize the configuration. Variables allow the same Terraform code to be reused across environments (dev/staging/prod) by changing values.",
  "outputs.tf": "Defines output values that Terraform exposes after a successful apply. Outputs are used to pass resource attributes (IDs, URLs, ARNs) to other modules or for human inspection.",
  "providers.tf": "Configures the cloud provider plugins (AWS, Azure, GCP) with authentication and region settings. Pins provider versions to ensure reproducible builds.",
};

const FILE_ICONS = {
  "main.tf": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  "variables.tf": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  ),
  "outputs.tf": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  "providers.tf": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
};

const FILE_COLORS = {
  "main.tf":      "from-brand-500/20 to-brand-500/5 border-brand-500/30 text-brand-300",
  "variables.tf": "from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-300",
  "outputs.tf":   "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300",
  "providers.tf": "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-300",
};

function ResourceCard({ block }) {
  const [open, setOpen] = useState(false);
  const typeLabel = block.type.replace(/^(aws_|azurerm_|google_)/, "").replace(/_/g, " ");
  const tagColor = block.type.startsWith("aws_") ? "bg-orange-500/10 text-orange-300 border-orange-500/20"
    : block.type.startsWith("azurerm_") ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
    : "bg-green-500/10 text-green-300 border-green-500/20";

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-white/[0.04] transition"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-slate-100">{block.id}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${tagColor}`}>{typeLabel}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400 line-clamp-2">{block.explanation}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mt-1 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/8 bg-white/[0.02] px-4 pb-4 pt-3 space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">{block.explanation}</p>

          {Object.keys(block.attrs).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Key Configuration</p>
              <div className="space-y-1">
                {Object.entries(block.attrs).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">{k}</span>
                    <span className="font-mono text-[11px] text-brand-300 break-all">{v.length > 60 ? v.slice(0, 60) + "…" : v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="font-mono text-[11px] text-slate-500">resource "{block.type}" "{block.id}"</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FileSection({ filename, content }) {
  const [open, setOpen] = useState(filename === "main.tf");
  const blocks = useMemo(() => parseResourceBlocks(content || ""), [content]);
  const summary = FILE_SUMMARIES[filename] || "Terraform configuration file.";
  const color = FILE_COLORS[filename] || "from-slate-500/20 to-slate-500/5 border-slate-500/30 text-slate-300";
  const icon = FILE_ICONS[filename];

  // For non-main files, parse variable/output/terraform blocks too
  const varCount = (content || "").match(/^variable\s+"/gm)?.length || 0;
  const outputCount = (content || "").match(/^output\s+"/gm)?.length || 0;

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-4 bg-gradient-to-r p-5 text-left transition hover:brightness-110 ${color}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-white">{filename}</span>
            {blocks.length > 0 && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/80">
                {blocks.length} resource{blocks.length !== 1 ? "s" : ""}
              </span>
            )}
            {varCount > 0 && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/80">
                {varCount} variable{varCount !== 1 ? "s" : ""}
              </span>
            )}
            {outputCount > 0 && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/80">
                {outputCount} output{outputCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/60 line-clamp-1">{summary}</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/10 bg-ink-950 p-5">
          <p className="mb-4 text-sm text-slate-300 leading-relaxed">{summary}</p>

          {blocks.length > 0 ? (
            <div className="space-y-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Resources Defined ({blocks.length})
              </p>
              {blocks.map((b, i) => <ResourceCard key={i} block={b} />)}
            </div>
          ) : filename === "variables.tf" ? (
            <VariableExplainer content={content} />
          ) : filename === "outputs.tf" ? (
            <OutputExplainer content={content} />
          ) : filename === "providers.tf" ? (
            <ProviderExplainer content={content} />
          ) : (
            <p className="text-sm text-slate-500">No resource blocks found in this file.</p>
          )}
        </div>
      )}
    </div>
  );
}

function VariableExplainer({ content }) {
  const vars = useMemo(() => {
    const result = [];
    const re = /variable\s+"([^"]+)"\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(content || "")) !== null) {
      const name = m[1];
      const body = m[2];
      const typeM = body.match(/type\s*=\s*(.+)/);
      const descM = body.match(/description\s*=\s*"([^"]+)"/);
      const defM = body.match(/default\s*=\s*"?([^"\n]+)"?/);
      result.push({
        name,
        type: typeM?.[1]?.trim() || "string",
        description: descM?.[1] || "",
        default: defM?.[1]?.trim(),
      });
    }
    return result;
  }, [content]);

  if (vars.length === 0) return <p className="text-sm text-slate-500">No variables declared.</p>;

  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Input Variables ({vars.length})</p>
      {vars.map((v) => (
        <div key={v.name} className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-violet-300">{v.name}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{v.type}</span>
            {v.default !== undefined && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">has default</span>
            )}
            {v.default === undefined && (
              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">required</span>
            )}
          </div>
          {v.description && <p className="text-xs text-slate-400">{v.description}</p>}
          {v.default !== undefined && (
            <p className="mt-1 font-mono text-[11px] text-slate-500">default: {v.default}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function OutputExplainer({ content }) {
  const outputs = useMemo(() => {
    const result = [];
    const re = /output\s+"([^"]+)"\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(content || "")) !== null) {
      const name = m[1];
      const body = m[2];
      const descM = body.match(/description\s*=\s*"([^"]+)"/);
      const valM = body.match(/value\s*=\s*(.+)/);
      result.push({ name, description: descM?.[1] || "", value: valM?.[1]?.trim() || "" });
    }
    return result;
  }, [content]);

  if (outputs.length === 0) return <p className="text-sm text-slate-500">No outputs declared.</p>;

  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Outputs ({outputs.length})</p>
      {outputs.map((o) => (
        <div key={o.name} className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
          <span className="font-mono text-xs font-semibold text-emerald-300">{o.name}</span>
          {o.description && <p className="mt-1 text-xs text-slate-400">{o.description}</p>}
          {o.value && <p className="mt-1 font-mono text-[11px] text-slate-500 break-all">{o.value}</p>}
        </div>
      ))}
    </div>
  );
}

function ProviderExplainer({ content }) {
  const providers = useMemo(() => {
    const result = [];
    const re = /provider\s+"([^"]+)"\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(content || "")) !== null) {
      const name = m[1];
      const body = m[2];
      const regionM = body.match(/region\s*=\s*"?([^"\n]+)"?/);
      result.push({ name, region: regionM?.[1]?.trim() });
    }
    return result;
  }, [content]);

  const PROVIDER_DESC = {
    aws: "Authenticates with AWS using environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or IAM role. Specify the target region for all resources.",
    azurerm: "Authenticates with Azure using a Service Principal or Managed Identity. Requires subscription_id, tenant_id, and client credentials.",
    google: "Authenticates with GCP using Application Default Credentials or a service account key. Specify the project and region.",
  };

  return (
    <div className="space-y-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Provider Configuration</p>
      {providers.map((p) => (
        <div key={p.name} className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-amber-300">{p.name}</span>
            {p.region && <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{p.region}</span>}
          </div>
          <p className="text-xs text-slate-400">{PROVIDER_DESC[p.name] || `Configures the ${p.name} provider for resource provisioning.`}</p>
        </div>
      ))}
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-300/80">
          Provider versions are pinned in the <code className="font-mono">required_providers</code> block to ensure reproducible deployments across team members and CI/CD pipelines.
        </p>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

const FILE_ORDER = ["main.tf", "variables.tf", "outputs.tf", "providers.tf"];

export default function TerraformExplainer({ files = {} }) {
  if (!files || Object.keys(files).length === 0) return null;

  const orderedFiles = [
    ...FILE_ORDER.filter((f) => files[f]),
    ...Object.keys(files).filter((f) => !FILE_ORDER.includes(f)),
  ];

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-brand-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Code Explanation</h2>
          <p className="text-xs text-slate-400">Detailed breakdown of every resource in each Terraform file</p>
        </div>
      </div>
      <div className="space-y-3">
        {orderedFiles.map((filename) => (
          <FileSection key={filename} filename={filename} content={files[filename]} />
        ))}
      </div>
    </section>
  );
}
