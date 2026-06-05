export const ARCHITECTURES = [
  // ── AWS ──────────────────────────────────────────────────────────────────
  {
    id: "aws-three-tier-web",
    name: "Three-Tier Web Application",
    provider: "aws",
    category: "Web Application",
    complexity: "medium",
    services: ["ALB", "EC2", "Auto Scaling", "RDS", "VPC", "NAT Gateway", "S3"],
    description:
      "Classic highly-available web application across two AZs. Public ALB routes HTTPS traffic to EC2 Auto Scaling in private subnets; Multi-AZ RDS Postgres sits in isolated subnets.",
    sourceOrg: "AWS",
    sourceType: "AWS Architecture Center",
    sourceUrl: "https://docs.aws.amazon.com/whitepapers/latest/web-application-hosting-best-practices/web-application-hosting-in-the-aws-cloud.html",
    textDescription: `Three-tier web application on AWS:
- VPC with public and private subnets across 2 availability zones
- Application Load Balancer (HTTPS/443) in public subnets
- EC2 Auto Scaling Group (t3.medium) in private subnets behind the ALB
- Multi-AZ RDS PostgreSQL (db.t3.medium) in isolated subnets
- NAT Gateway for outbound internet from private subnets
- Security groups: ALB allows 443 inbound, EC2 allows 8080 from ALB only, RDS allows 5432 from EC2 only
- S3 bucket for static assets and application logs`,
  },
  {
    id: "aws-serverless-api",
    name: "Serverless REST API",
    provider: "aws",
    category: "Serverless",
    complexity: "low",
    services: ["API Gateway", "Lambda", "DynamoDB", "IAM", "CloudWatch", "S3"],
    description:
      "Fully serverless API backed by Lambda functions and DynamoDB. API Gateway handles routing and authorization; CloudWatch collects logs and metrics.",
    sourceOrg: "AWS",
    sourceType: "AWS Serverless Application Lens",
    sourceUrl: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html",
    textDescription: `Serverless REST API on AWS:
- API Gateway (REST) with Lambda proxy integration
- Lambda functions (Node.js/Python) for each route handler
- DynamoDB table with on-demand billing for data storage
- IAM execution role for Lambda with least-privilege DynamoDB access
- CloudWatch log groups and alarms for Lambda errors
- S3 bucket for Lambda deployment packages`,
  },
  {
    id: "aws-static-cloudfront",
    name: "Static Website with CloudFront CDN",
    provider: "aws",
    category: "Web Application",
    complexity: "low",
    services: ["CloudFront", "S3", "Route53", "ACM", "WAF"],
    description:
      "Global static website hosted on S3, distributed via CloudFront CDN with HTTPS, custom domain via Route53, and WAF protection.",
    sourceOrg: "AWS",
    sourceType: "AWS Documentation",
    sourceUrl: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/getting-started-secure-static-website-cloudformation-template.html",
    textDescription: `Static website with CloudFront CDN on AWS:
- S3 bucket (private) for website content, no public access
- CloudFront distribution with Origin Access Control (OAC) pointing to S3
- ACM certificate (us-east-1) for HTTPS on custom domain
- Route53 hosted zone with A/AAAA alias records pointing to CloudFront
- CloudFront security headers policy and HTTPS redirect
- WAF WebACL attached to CloudFront with AWS managed rules`,
  },
  {
    id: "aws-ecs-microservices",
    name: "ECS Fargate Microservices",
    provider: "aws",
    category: "Containers",
    complexity: "high",
    services: ["ECS Fargate", "ALB", "ECR", "RDS", "ElastiCache", "VPC", "Secrets Manager"],
    description:
      "Container-based microservices on ECS Fargate behind an ALB. Services communicate via service discovery; secrets managed via AWS Secrets Manager; Redis for session caching.",
    sourceOrg: "AWS",
    sourceType: "AWS Architecture Center",
    sourceUrl: "https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/architecture.html",
    textDescription: `ECS Fargate microservices on AWS:
- VPC with public and private subnets across 2 AZs
- Application Load Balancer in public subnets routing to ECS services
- ECS Fargate cluster with 3 services (API, Worker, Admin)
- ECR repositories for container images
- RDS Aurora PostgreSQL in private subnets
- ElastiCache Redis in private subnets for session caching
- Secrets Manager for database credentials
- CloudWatch Container Insights for monitoring`,
  },
  {
    id: "aws-data-lake",
    name: "Data Lake on S3",
    provider: "aws",
    category: "Data & Analytics",
    complexity: "high",
    services: ["S3", "Glue", "Athena", "Lake Formation", "IAM", "CloudTrail"],
    description:
      "Scalable data lake architecture on S3 with AWS Glue for ETL, Athena for SQL queries, and Lake Formation for fine-grained access control.",
    sourceOrg: "AWS",
    sourceType: "AWS Big Data Blog",
    sourceUrl: "https://aws.amazon.com/blogs/big-data/build-a-lake-house-architecture-on-aws/",
    textDescription: `Data lake on AWS:
- S3 buckets for raw, processed, and curated data zones
- AWS Glue Data Catalog as central metadata repository
- Glue ETL jobs for data transformation (raw → processed → curated)
- Athena for ad-hoc SQL queries on S3 data
- Lake Formation for column-level and row-level access control
- IAM roles for Glue, Athena, and data analyst access
- CloudTrail logging for audit trail`,
  },
  {
    id: "aws-event-driven",
    name: "Event-Driven Architecture",
    provider: "aws",
    category: "Messaging",
    complexity: "medium",
    services: ["SQS", "SNS", "Lambda", "EventBridge", "DynamoDB", "CloudWatch"],
    description:
      "Decoupled event-driven system using SNS for pub/sub fan-out, SQS for reliable message delivery, Lambda consumers, and EventBridge for scheduled events.",
    sourceOrg: "AWS",
    sourceType: "AWS Well-Architected Framework",
    sourceUrl: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/event-driven-architectures.html",
    textDescription: `Event-driven architecture on AWS:
- SNS topic for fan-out notifications to multiple subscribers
- SQS queues (standard + dead-letter) for reliable message processing
- Lambda functions consuming from SQS with batch processing
- EventBridge rules for scheduled events (cron jobs)
- DynamoDB table for event state tracking
- CloudWatch alarms on SQS queue depth and Lambda errors`,
  },
  {
    id: "aws-eks-cluster",
    name: "EKS Kubernetes Cluster",
    provider: "aws",
    category: "Containers",
    complexity: "high",
    services: ["EKS", "EC2 Node Groups", "ALB Ingress", "ECR", "IAM OIDC", "VPC CNI"],
    description:
      "Production EKS cluster with managed node groups, ALB Ingress Controller, IRSA for pod IAM roles, and cluster autoscaler.",
    sourceOrg: "AWS",
    sourceType: "AWS EKS Best Practices Guide",
    sourceUrl: "https://aws.github.io/aws-eks-best-practices/",
    textDescription: `EKS Kubernetes cluster on AWS:
- EKS cluster (1.29) with managed node groups (m5.xlarge)
- VPC with private subnets for nodes, public subnets for load balancers
- ALB Ingress Controller for HTTP/HTTPS routing
- IRSA (IAM Roles for Service Accounts) via OIDC provider
- EBS CSI driver for persistent volumes
- Cluster Autoscaler for node scaling
- CloudWatch Container Insights and Fluent Bit for logging`,
  },

  // ── Azure ─────────────────────────────────────────────────────────────────
  {
    id: "azure-app-service-web",
    name: "Azure App Service Web App",
    provider: "azure",
    category: "Web Application",
    complexity: "medium",
    services: ["App Service", "Azure SQL", "Application Gateway", "Key Vault", "App Insights"],
    description:
      "Scalable web application using Azure App Service behind Application Gateway, Azure SQL Database for persistence, and Key Vault for secrets.",
    sourceOrg: "Microsoft",
    sourceType: "Azure Architecture Center",
    sourceUrl: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/app-service-web-app/basic-web-app",
    textDescription: `Web application on Azure:
- Azure App Service Plan (P2v3) with Web App
- Application Gateway (WAF v2) as ingress with SSL termination
- Azure SQL Database (General Purpose, 4 vCores)
- Azure Key Vault for application secrets and certificates
- Application Insights for monitoring and diagnostics
- Virtual Network with separate subnets for app and data tiers
- Managed Identity for App Service to access Key Vault`,
  },
  {
    id: "azure-aks-microservices",
    name: "AKS Microservices",
    provider: "azure",
    category: "Containers",
    complexity: "high",
    services: ["AKS", "Azure Container Registry", "Application Gateway", "Azure SQL", "Key Vault", "Monitor"],
    description:
      "Kubernetes-based microservices platform on AKS with AGIC, managed identity, Azure Container Registry, and Azure Monitor for observability.",
    sourceOrg: "Microsoft",
    sourceType: "Azure Architecture Center",
    sourceUrl: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-microservices/aks-microservices",
    textDescription: `AKS microservices on Azure:
- AKS cluster (1.28) with system and user node pools
- Azure Container Registry for Docker images
- Application Gateway Ingress Controller (AGIC)
- Azure SQL Managed Instance in private subnet
- Azure Key Vault with CSI driver for secret injection
- Managed Identity for AKS workloads (Workload Identity)
- Azure Monitor and Container Insights for observability`,
  },
  {
    id: "azure-serverless-functions",
    name: "Azure Serverless Functions",
    provider: "azure",
    category: "Serverless",
    complexity: "low",
    services: ["Azure Functions", "API Management", "Cosmos DB", "Storage Account", "Application Insights"],
    description:
      "Serverless event-driven application using Azure Functions exposed via API Management, with Cosmos DB for globally distributed storage.",
    sourceOrg: "Microsoft",
    sourceType: "Azure Architecture Center",
    sourceUrl: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/serverless/web-app",
    textDescription: `Serverless application on Azure:
- Azure Functions (Consumption plan) for API handlers
- API Management in front of Functions for routing and rate limiting
- Cosmos DB (serverless) for globally distributed NoSQL storage
- Storage Account for Function app code and blob storage
- Application Insights for distributed tracing and monitoring
- Managed Identity for Functions to access Cosmos DB`,
  },

  // ── GCP ──────────────────────────────────────────────────────────────────
  {
    id: "gcp-gke-cluster",
    name: "GKE Kubernetes Cluster",
    provider: "gcp",
    category: "Containers",
    complexity: "high",
    services: ["GKE", "Cloud Load Balancing", "Cloud SQL", "Artifact Registry", "Cloud Armor", "Workload Identity"],
    description:
      "Production GKE cluster with Autopilot mode, Cloud Load Balancing, Cloud Armor WAF, Workload Identity for pod permissions, and Cloud SQL for managed databases.",
    sourceOrg: "Google Cloud",
    sourceType: "Google Cloud Architecture Center",
    sourceUrl: "https://cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke",
    textDescription: `GKE cluster on Google Cloud:
- GKE Autopilot cluster for managed node provisioning
- VPC with custom subnets and secondary IP ranges for pods/services
- Cloud Load Balancing with HTTPS ingress
- Cloud Armor WAF policy attached to load balancer
- Cloud SQL PostgreSQL (db-n1-standard-2) with private IP
- Artifact Registry for container images
- Workload Identity for pod-level IAM permissions`,
  },
  {
    id: "gcp-cloud-run-serverless",
    name: "Cloud Run Serverless Platform",
    provider: "gcp",
    category: "Serverless",
    complexity: "medium",
    services: ["Cloud Run", "Cloud Load Balancing", "Firestore", "Pub/Sub", "Cloud Armor", "Secret Manager"],
    description:
      "Serverless container platform on Cloud Run with global HTTPS load balancing, Firestore for NoSQL data, Pub/Sub for async messaging, and Secret Manager for credentials.",
    sourceOrg: "Google Cloud",
    sourceType: "Google Cloud Architecture Center",
    sourceUrl: "https://cloud.google.com/architecture/cloud-run-microservices",
    textDescription: `Serverless platform on Google Cloud:
- Cloud Run services for API containers (auto-scaling to zero)
- Global HTTPS Load Balancer with Cloud Armor WAF
- Firestore in Native mode for serverless NoSQL
- Pub/Sub topics and subscriptions for async event processing
- Cloud Run Jobs for batch processing tasks
- Secret Manager for application secrets
- Cloud Monitoring and Cloud Logging for observability`,
  },
];

export const CATEGORIES = [...new Set(ARCHITECTURES.map((a) => a.category))].sort();
export const PROVIDERS = ["aws", "azure", "gcp"];
