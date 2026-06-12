export const RELEASES = [
  {
    version: "2.0.0",
    date: "2026-06-12",
    badge: "new",
    title: "Draw.io & Excalidraw Import",
    summary: "Import your existing .drawio, .xml, or .excalidraw diagram files directly. TerraSketch parses cloud service shapes and connections client-side and generates Terraform from the extracted architecture — no re-drawing needed.",
    highlights: [
      {
        icon: "generate",
        label: "Draw.io file import",
        detail: "Upload a .drawio or .xml file exported from draw.io. TerraSketch reads every AWS, Azure, and GCP shape icon and connection arrow, then generates accurate Terraform reflecting your exact topology.",
      },
      {
        icon: "diagram",
        label: "Excalidraw import",
        detail: "Import .excalidraw files. Shape labels are extracted and connections (arrows) are mapped to Terraform dependencies. Cloud provider is auto-detected from your labels.",
      },
      {
        icon: "shield",
        label: "Auto provider detection",
        detail: "The parser reads draw.io shape styles (mxgraph.aws4.*, mxgraph.azure.*, mxgraph.gcp2.*) and auto-selects the matching cloud provider — no manual selection needed.",
      },
      {
        icon: "dashboard",
        label: "Parsed preview before generating",
        detail: "After import you see a card with detected provider badge, component count, connection count, and a full chip list of every service found — so you know exactly what the AI will receive before clicking Generate.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-06-11",
    badge: "new",
    title: "Token Usage, Feedback Email & Production Deploy",
    summary: "Live on Render with auto-deploy, feedback emails via Resend, token usage tracking on every generation, and Google Sign-In in production.",
    highlights: [
      {
        icon: "dashboard",
        label: "Token usage card",
        detail: "Every new generation shows a token breakdown (Prompt / Completion / Total) below the KPI cards so you can track LLM cost per generation.",
      },
      {
        icon: "mail",
        label: "Feedback emails via Resend",
        detail: "Switched from Gmail SMTP (blocked on Render free tier) to Resend HTTP API. Every star rating now arrives in your inbox instantly with generation ID, category, and comment.",
      },
      {
        icon: "generate",
        label: "Production deploy on Render",
        detail: "TerraSketch is live at terrasketch.onrender.com — single Docker container serving both React frontend and FastAPI backend. Auto-deploys on every GitHub push.",
      },
      {
        icon: "shield",
        label: "Google Sign-In in production",
        detail: "Fixed VITE_GOOGLE_CLIENT_ID baked into the production build and registered the Render domain as an authorized JavaScript origin in Google Cloud Console.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-06-11",
    badge: "new",
    title: "Bug Fixes — Generation & Feedback",
    summary: "Fixed the 'Cannot compare with a generation from another account' error, the broken feedback submit button, and the API URL pointing to localhost in production.",
    highlights: [
      {
        icon: "feedback",
        label: "Feedback submit fixed",
        detail: "The Submit button was silently blocked by an incorrect asyncio.ensure_future background task pattern. Replaced with FastAPI's native BackgroundTasks which awaits async functions correctly.",
      },
      {
        icon: "warning",
        label: "Generation compare fixed",
        detail: "Re-generating after logging in with Google threw a 403 'Cannot compare with a generation from another account'. Now silently skips the diff if the reference generation is inaccessible.",
      },
      {
        icon: "generate",
        label: "Production API URL fixed",
        detail: "api.js was falling back to http://localhost:8000 in production builds when VITE_API_URL was empty. Changed to use same-origin (empty string) which correctly routes to the deployed backend.",
      },
      {
        icon: "star",
        label: "Star rating UX improved",
        detail: "Submit button no longer silently ignores clicks when no star is selected. Now shows an amber validation message and a hover-preview on the stars with a 'Click to rate' hint.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-06-11",
    badge: "new",
    title: "Scale Tiers & DR Options",
    summary: "Three generation tiers (Small 0–100, Mid 100–1K, High 1K+ users) with disaster recovery strategies and # WHY / # DR-OPTION comments in every generated file.",
    highlights: [
      {
        icon: "scale",
        label: "Three scale tiers",
        detail: "Small maps to Backup & Restore DR, Mid to Warm Standby, High to Active-Active — matching AWS Well-Architected Framework DR strategies.",
      },
      {
        icon: "doc",
        label: "WHY and DR-OPTION comments",
        detail: "Every generated resource includes a # WHY comment explaining the design choice and a # DR-OPTION comment describing the disaster recovery trade-off for that tier.",
      },
      {
        icon: "compliance",
        label: "Instance sizing per tier",
        detail: "Small uses t3.micro/burstable instances, Mid uses m5.large with Multi-AZ, High uses c5.2xlarge with active-active replication and auto-scaling groups.",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-06-07",
    badge: null,
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
    date: "2026-06-07",
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

export const CURRENT_VERSION = "2.0.0";
