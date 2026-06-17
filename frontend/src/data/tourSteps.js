/**
 * Per-route product-tour definitions for React Joyride.
 *
 * Targets use stable selectors that already exist in the DOM (nav hrefs and a
 * handful of `data-tour="…"` hooks). TourGuide filters out any step whose
 * target isn't present before starting, so missing targets never break a tour.
 */

const intro = (title, content) => ({
  target: "body",
  placement: "center",
  title,
  content,
  disableBeacon: true,
});

export const ROUTE_STEPS = {
  "/": [
    intro(
      "Welcome to TerraSketch 👋",
      "Turn cloud architecture diagrams or plain text into production-ready Terraform in seconds. Here's a quick look around."
    ),
    {
      target: 'a[href="/generate"]',
      title: "Generate",
      content: "Start here — upload a diagram or describe your stack and get Terraform back.",
    },
    {
      target: 'a[href="/library"]',
      title: "Architecture Library",
      content: "Browse ready-made patterns (3-tier, serverless, EKS, data lake and more).",
    },
    {
      target: 'a[href="/docs"]',
      title: "Docs",
      content: "Learn how inputs, providers, compliance and outputs work.",
    },
  ],
  "/generate": [
    intro(
      "Generate Terraform",
      "Three ways in: upload a PNG diagram, import a .drawio / .excalidraw file, or describe your architecture in plain text."
    ),
    {
      target: '[data-tour="generator-panel"]',
      title: "Your input",
      content:
        "Pick a cloud (AWS / Azure / GCP), environment and scale tier, then add your diagram or description and generate.",
    },
  ],
  "/result": [
    intro(
      "Your generation",
      "Here's the generated Terraform plus security, cost and compliance insights — all on one page."
    ),
    {
      target: '[data-tour="result-kpis"]',
      title: "At a glance",
      content: "Diagram match, resource count, confidence, complexity and placeholders that need review.",
    },
    {
      target: '[data-tour="result-tools"]',
      title: "Insight tools",
      content:
        "Cost estimated from your actual code, a security score, compliance checks and an architecture diagram mapped from the Terraform.",
    },
    {
      target: '[data-tour="result-code"]',
      title: "Terraform output",
      content: "Your files — copy or download them, and search for <REPLACE_*> placeholders before deploying.",
    },
  ],
  "/history": [
    intro("History", "Your recent generations live here — open any card to revisit it."),
    {
      target: '[data-tour="history-new"]',
      title: "New generation",
      content: "Kick off a fresh one anytime.",
    },
  ],
  "/review": [
    intro(
      "Review Terraform",
      "Upload existing .tf files and get improvement suggestions with plain-English explanations."
    ),
  ],
  "/library": [intro("Architecture Library", "Pre-built patterns you can generate from in one click.")],
  "/templates": [intro("Templates", "Reusable starting points for common stacks.")],
  "/docs": [intro("Docs", "Everything about inputs, providers, compliance and the generated output.")],
  "/signin": [intro("Account", "Sign in to sync your generations to your email across devices.")],
};

const GREETINGS = {
  "/": "New here? Take a 30-second tour of TerraSketch.",
  "/generate": "Want a walkthrough of the Generate studio?",
  "/result": "Want a tour of your results and insight tools?",
  "/history": "Want a quick tour of your history?",
  "/review": "Want a tour of the Review tool?",
  "/library": "Want a tour of the Architecture Library?",
  "/templates": "Want a tour of Templates?",
  "/docs": "Want a quick tour of the Docs?",
  "/signin": "Want a quick tour?",
};

const FALLBACK_STEPS = [
  intro(
    "TerraSketch",
    "Use the menu to explore Generate, Review, Library, Templates, History and Docs. Tap the help bubble on any page for a tour."
  ),
];

export function stepsForPath(pathname = "/") {
  if (pathname.startsWith("/result")) return ROUTE_STEPS["/result"];
  return ROUTE_STEPS[pathname] || FALLBACK_STEPS;
}

export function greetingForPath(pathname = "/") {
  if (pathname.startsWith("/result")) return GREETINGS["/result"];
  return GREETINGS[pathname] || "Want a quick tour of this page?";
}
