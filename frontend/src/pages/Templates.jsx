import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const TEMPLATES = [
  {
    id: "3tier_aws",
    provider: "aws",
    title: "3-Tier Web App",
    subtitle: "AWS",
    tags: ["ALB", "EC2", "RDS", "VPC"],
    color: "from-orange-500/25 to-amber-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    description:
      "Classic VPC with public/private subnets, an Application Load Balancer in front of EC2 instances in Auto Scaling, and a Multi-AZ RDS Postgres database in isolated subnets.",
    text: `A 3-tier web application on AWS. Architecture:
- VPC with public and private subnets across 2 availability zones
- Application Load Balancer (HTTPS) in the public subnets
- EC2 Auto Scaling Group (t3.medium) in private subnets behind the ALB
- Multi-AZ RDS PostgreSQL (db.t3.medium) in isolated subnets
- NAT Gateway for outbound internet from private subnets
- Security groups: ALB allows 443, EC2 allows 8080 from ALB only, RDS allows 5432 from EC2 only
- S3 bucket for static assets and application logs
Environment: production`,
  },
  {
    id: "serverless_aws",
    provider: "aws",
    title: "Serverless API",
    subtitle: "AWS",
    tags: ["API GW", "Lambda", "DynamoDB", "S3"],
    color: "from-yellow-500/25 to-orange-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    description:
      "Fully serverless REST API — API Gateway triggers Lambda functions, backed by DynamoDB tables and an S3 bucket for file storage. No servers to manage.",
    text: `A serverless REST API on AWS. Architecture:
- API Gateway (HTTP API) with JWT authorizer
- Lambda functions (Python 3.12, 512 MB) for CRUD operations
- DynamoDB table with on-demand billing and GSI for queries
- S3 bucket for file uploads with pre-signed URL generation
- SQS queue for async background jobs
- CloudWatch log groups for each Lambda function
- IAM roles with least-privilege policies
Environment: production`,
  },
  {
    id: "microservices_aws",
    provider: "aws",
    title: "Microservices on ECS",
    subtitle: "AWS",
    tags: ["ECS Fargate", "ALB", "ECR", "ElastiCache"],
    color: "from-brand-500/25 to-cyan-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <rect x="14" y="2" width="8" height="8" rx="1" />
        <rect x="2" y="14" width="8" height="8" rx="1" />
        <rect x="14" y="14" width="8" height="8" rx="1" />
      </svg>
    ),
    description:
      "Container-based microservices on ECS Fargate with an ALB routing to multiple services, ElastiCache Redis for session caching, and ECR for container images.",
    text: `Microservices architecture on AWS ECS Fargate. Architecture:
- VPC with public, private, and data subnets across 3 AZs
- Application Load Balancer with path-based routing to multiple ECS services
- ECS Fargate cluster with 3 services: API, auth, and worker
- ECR repositories for each service image
- ElastiCache Redis cluster for session caching
- RDS Aurora PostgreSQL (serverless v2) for persistent data
- SQS queues for inter-service messaging
- CloudFront CDN in front of the ALB
- Secrets Manager for database credentials and API keys
Environment: production`,
  },
  {
    id: "data_pipeline_aws",
    provider: "aws",
    title: "Data Pipeline",
    subtitle: "AWS",
    tags: ["Kinesis", "Lambda", "S3", "Redshift"],
    color: "from-purple-500/25 to-violet-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    description:
      "Real-time data ingestion pipeline: Kinesis streams ingest events, Lambda transforms and loads to S3 data lake, Glue crawls the data, and Athena queries it.",
    text: `A real-time data pipeline on AWS. Architecture:
- Kinesis Data Stream with 4 shards for event ingestion
- Lambda function (consumer) for stream processing and transformation
- S3 data lake with partitioned prefixes (year/month/day)
- AWS Glue crawler and catalog for schema discovery
- Athena workgroup for SQL queries over S3 data
- SNS + SQS for dead-letter queue handling
- CloudWatch dashboards and alarms for pipeline health
- IAM roles for cross-service access
Environment: production`,
  },
  {
    id: "webapp_azure",
    provider: "azure",
    title: "Web App",
    subtitle: "Azure",
    tags: ["App Service", "SQL", "Storage", "CDN"],
    color: "from-blue-500/25 to-sky-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    description:
      "Azure App Service web application with Azure SQL Database, Blob Storage, and Azure CDN for static content delivery.",
    text: `A web application on Microsoft Azure. Architecture:
- Azure App Service (P2v3 plan) running a Node.js application
- Azure SQL Database (General Purpose, 4 vCores) for relational data
- Azure Blob Storage account for file uploads and static assets
- Azure CDN profile with a custom domain endpoint
- Azure Redis Cache (C1 Standard) for session and data caching
- Virtual Network with app integration
- Azure Key Vault for secrets management
- Application Insights for monitoring and telemetry
Environment: production`,
  },
  {
    id: "gke_gcp",
    provider: "gcp",
    title: "Kubernetes on GKE",
    subtitle: "GCP",
    tags: ["GKE", "Cloud SQL", "Pub/Sub", "Cloud Run"],
    color: "from-green-500/25 to-emerald-500/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    description:
      "GKE Autopilot cluster with Cloud SQL Postgres, Pub/Sub for async messaging, Cloud Storage buckets, and Cloud Run for lightweight services.",
    text: `A Kubernetes workload on Google Cloud. Architecture:
- GKE Autopilot cluster in a custom VPC
- Cloud SQL PostgreSQL 15 with private IP (no public access)
- Cloud Storage bucket for object storage with lifecycle policies
- Pub/Sub topics and subscriptions for event-driven messaging
- Cloud Run service for lightweight API microservices
- Artifact Registry for container images
- Cloud Load Balancing with managed SSL certificate
- Secret Manager for secrets and credentials
- VPC Connector for serverless VPC access
Environment: production`,
  },
];

const PROVIDER_COLORS = {
  aws: "text-orange-300 bg-orange-400/10 border-orange-400/20",
  azure: "text-blue-300 bg-blue-400/10 border-blue-400/20",
  gcp: "text-green-300 bg-green-400/10 border-green-400/20",
};

export default function Templates() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.provider === filter);

  const use = (tpl) => {
    navigate("/generate", {
      state: { prefill: { text: tpl.text, provider: tpl.provider } },
    });
  };

  return (
    <main className="container-page min-w-0 py-6 sm:py-10 md:py-14">
      <header className="mb-8">
        <h1 className="heading-display text-3xl sm:text-4xl">Architecture Templates</h1>
        <p className="mt-2 text-sm text-slate-400">
          One-click pre-built architectures — click Use to pre-fill the Generate form.
        </p>
      </header>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {["all", "aws", "azure", "gcp"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === p
                ? "border-brand-400/50 bg-brand-500/15 text-white"
                : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200"
            }`}
          >
            {p === "all" ? "All" : p.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl) => (
          <div
            key={tpl.id}
            className="card-glow flex flex-col overflow-hidden transition hover:bg-white/[0.08]"
          >
            <div className={`bg-gradient-to-br ${tpl.color} p-5`}>
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white">
                  <span className="block h-5 w-5">{tpl.icon}</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${PROVIDER_COLORS[tpl.provider]}`}>
                  {tpl.subtitle}
                </span>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold text-white">{tpl.title}</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {tpl.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-5">
              <p className="flex-1 text-sm leading-relaxed text-slate-400">{tpl.description}</p>
              <button
                type="button"
                onClick={() => use(tpl)}
                className="btn-primary mt-4 w-full justify-center"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9 11 3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Use this template
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
