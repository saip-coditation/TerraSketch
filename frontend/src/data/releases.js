export const RELEASES = [
  {
    version: "1.6.0",
    date: "2025-06-07",
    badge: "new",
    title: "Terraform File Review & Improvement",
    summary: "Upload your existing .tf files — TerraSketch audits them for security, cost, and best practices, then returns a fully improved version of every file.",
    highlights: [
      {
        icon: "shield",
        label: "5-category security audit",
        detail: "Every uploaded file is scanned across Security, Cost, Reliability, Best Practices, and Compliance. Issues are ranked Critical → High → Medium → Low with specific explanations.",
      },
      {
        icon: "doc",
        label: "Improved files with toggle",
        detail: "Each file shows an Original ↔ Improved toggle so you can see exactly what changed. Every fix is annotated with a # IMPROVED: comment explaining the reasoning.",
      },
      {
        icon: "diff",
        label: "Zip upload support",
        detail: "Upload a .zip containing your Terraform project and all .tf files are extracted automatically. Individual .tf file multi-select also supported.",
      },
      {
        icon: "compliance",
        label: "Changes summary",
        detail: "A plain-English list of every change made across all files — no diff-reading required.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2025-06-07",
    badge: "new",
    title: "Dashboard Results & Code Explainer",
    summary: "Complete redesign of the Result page as a metrics dashboard, plus detailed plain-English explanations for every Terraform resource.",
    highlights: [
      {
        icon: "dashboard",
        label: "Dashboard KPI cards",
        detail: "Six stat widgets at the top — Match Score, Resources, Files, Avg Confidence, Complexity, Placeholders — visible at a glance without scrolling.",
      },
      {
        icon: "doc",
        label: "Code Explanation section",
        detail: "New section below each generated result explains every resource block, variable, output, and provider configuration in plain English. Expandable cards with key attribute display.",
      },
      {
        icon: "scale",
        label: "Scale-aware Terraform generation",
        detail: "Choose Small (0–100 users), Mid (100–1,000), or High (1,000+) scale. Generated code includes appropriately sized instances, replication settings, auto-scaling policies, and disaster recovery configurations with reasoning comments.",
      },
      {
        icon: "mail",
        label: "Email feedback notifications",
        detail: "Every submitted user rating is now forwarded to the TerraSketch team email for manual review and model improvement tracking.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2025-05-28",
    badge: "new",
    title: "Architecture Library & Safe Starter Generation",
    summary: "Verified Architecture Reference Library with 12 production-grade patterns, plus a new safe starter generation strategy with confidence scores and placeholders.",
    highlights: [
      {
        icon: "library",
        label: "Verified Architecture Library",
        detail: "12 curated architectures from AWS, Azure, and GCP official sources — Three-Tier Web, Serverless API, EKS, Data Lake, Event-Driven, AKS, Cloud Run, and more. Each has a live source URL, service tags, and a one-click 'Generate Terraform' shortcut.",
      },
      {
        icon: "shield",
        label: "Confidence scores per file",
        detail: "Every generation now includes a 0–100 confidence score for each Terraform file, reflecting how clearly the resource was specified in your input. Low scores are flagged for manual review.",
      },
      {
        icon: "placeholder",
        label: "Smart placeholders",
        detail: "Values that cannot be determined (CIDRs, account IDs, IAM roles, domain names) are replaced with typed placeholders like <REPLACE_ACCOUNT_ID> so you never accidentally deploy with invented values.",
      },
      {
        icon: "warning",
        label: "Starter template banner",
        detail: "Amber warning banner on every result reminding engineers that generated code is 60–70% complete and requires review before deployment.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2025-05-15",
    badge: null,
    title: "Mermaid Architecture Diagrams & Feedback Categories",
    summary: "Visual architecture diagram rendered directly in the browser from generated resources, plus categorized user feedback saved to Supabase.",
    highlights: [
      {
        icon: "diagram",
        label: "Visual Mermaid diagrams",
        detail: "Resources are automatically grouped into Network, Frontend, Compute, Data, Messaging, and Security layers. Arrows show data flow between tiers. Export as Mermaid code or open in Mermaid Live.",
      },
      {
        icon: "feedback",
        label: "Categorized feedback",
        detail: "Feedback ratings can now be tagged (Accuracy, Code Quality, Security, Cost, Compliance, General) and are persisted to Supabase with optional user ID for signed-in users.",
      },
      {
        icon: "port",
        label: "Port conflict resolution",
        detail: "TerraSketch backend moved to port 8010 to avoid conflicts with other local services. Run script and Vite proxy updated accordingly.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2025-05-01",
    badge: null,
    title: "Compliance Checker, Cost Optimizer & Tfvars Generator",
    summary: "Three new analysis panels added to the Result sidebar: automated compliance checking, cost optimization tips, and a one-click .tfvars generator.",
    highlights: [
      {
        icon: "compliance",
        label: "Compliance checker",
        detail: "Scans generated HCL against SOC 2, HIPAA, GDPR, and PCI-DSS requirements. Flags missing encryption, logging, access controls, and data residency issues.",
      },
      {
        icon: "cost",
        label: "Cost optimizer",
        detail: "Detects common cost inefficiencies — oversized instances, missing lifecycle policies, no Reserved Instance or Savings Plan annotations — and suggests alternatives with estimated savings.",
      },
      {
        icon: "tfvars",
        label: "Tfvars generator",
        detail: "Extracts all declared variables and generates a ready-to-use terraform.tfvars file with placeholder values and inline comments.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2025-04-18",
    badge: null,
    title: "Security Score, File Diff & Terraform Graph",
    summary: "Security scanning against 15 HCL checks, line-level diff summary between generations, and Terraform dependency graph generation.",
    highlights: [
      {
        icon: "shield",
        label: "Security score panel",
        detail: "15 automated checks covering IAM wildcard policies, unencrypted storage (RDS, EBS, S3), public subnet placement, missing deletion protection, and hardcoded secrets. Critical findings shown in red, high in amber.",
      },
      {
        icon: "diff",
        label: "File diff summary",
        detail: "When a compare_generation_id is provided, a line-level diff summary shows exactly what changed across all four .tf files between generations.",
      },
      {
        icon: "graph",
        label: "Terraform dependency graph",
        detail: "Generates a visual resource dependency graph using terraform graph piped through Graphviz. Run it locally with: terraform graph | dot -Tpng > graph.png",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2025-04-01",
    badge: null,
    title: "Initial Release",
    summary: "TerraSketch launched. Upload a diagram or describe your architecture in text to generate production-grade Terraform HCL for AWS, Azure, and GCP.",
    highlights: [
      {
        icon: "generate",
        label: "Diagram-to-Terraform generation",
        detail: "Upload a PNG/JPG architecture diagram or type a text description. TerraSketch uses Azure OpenAI GPT-4o to generate a four-file Terraform project (main.tf, variables.tf, outputs.tf, providers.tf).",
      },
      {
        icon: "providers",
        label: "AWS, Azure, and GCP support",
        detail: "Full support for all three major cloud providers with provider-specific rules, resource naming conventions, and best-practice defaults.",
      },
      {
        icon: "history",
        label: "Generation history",
        detail: "Every generation is saved to Supabase PostgreSQL and accessible from the History page. Re-generate or compare past results.",
      },
      {
        icon: "match",
        label: "Match score & insights",
        detail: "Each result includes a diagram match percentage, improvement advice, and resource identification summary.",
      },
    ],
  },
];

export const CURRENT_VERSION = "1.6.0";
