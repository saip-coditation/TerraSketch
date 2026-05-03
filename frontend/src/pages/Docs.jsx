import React from "react";
import { Link } from "react-router-dom";

const SECTIONS = [
  {
    title: "What kinds of diagrams work?",
    body: (
      <ul className="list-inside list-disc space-y-1.5 text-slate-300">
        <li>
          Cloud architecture diagrams (e.g., from Lucidchart, draw.io, Excalidraw,
          Whimsical, Cloudcraft, or even a clean whiteboard photo).
        </li>
        <li>
          Diagrams that label cloud services (e.g., "VPC", "RDS Postgres",
          "S3 bucket", "Cloud Run").
        </li>
        <li>
          Arrows / connections between components — these become Terraform
          dependencies (security groups, subnet associations, IAM, etc.).
        </li>
      </ul>
    ),
  },
  {
    title: "Tips for great results",
    body: (
      <ul className="list-inside list-disc space-y-1.5 text-slate-300">
        <li>Label every resource clearly.</li>
        <li>Indicate regions / zones if they matter to your design.</li>
        <li>Group public vs private resources so the AI can model subnets correctly.</li>
        <li>For complex setups, split into multiple diagrams and generate per-module.</li>
      </ul>
    ),
  },
  {
    title: "What you'll get back",
    body: (
      <div className="space-y-2 text-slate-300">
        <p>Each generation returns four Terraform files:</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <code className="font-mono text-brand-300">main.tf</code> — every
            resource block with comments
          </li>
          <li>
            <code className="font-mono text-brand-300">variables.tf</code> — all
            configurable knobs
          </li>
          <li>
            <code className="font-mono text-brand-300">outputs.tf</code> — useful
            outputs (IDs, endpoints, ARNs)
          </li>
          <li>
            <code className="font-mono text-brand-300">providers.tf</code> —
            pinned provider versions
          </li>
        </ul>
        <p>
          Plus the AI's list of <strong>resources identified</strong> and any{" "}
          <strong>assumptions</strong> it made when the diagram was ambiguous.
        </p>
      </div>
    ),
  },
  {
    title: "Privacy",
    body: (
      <p className="text-slate-300">
        Diagrams and text descriptions are sent to the Anthropic API for
        processing and stored along with the generated Terraform in our
        database, keyed to an anonymous browser session. No login required for
        the MVP.
      </p>
    ),
  },
];

export default function Docs() {
  return (
    <main className="container-page min-w-0 py-10 sm:py-14">
      <div className="mx-auto min-w-0 max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Docs
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Everything you need to know to get great Terraform out of TerraSketch.
          </p>
        </header>

        <div className="space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.title} className="card p-5 sm:p-6">
              <h2 className="text-base font-semibold text-white">{s.title}</h2>
              <div className="mt-2 break-words text-sm leading-relaxed">{s.body}</div>
            </section>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link to="/generate" className="btn-primary">
            Generate Terraform now
          </Link>
        </div>
      </div>
    </main>
  );
}
