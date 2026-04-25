import React from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Diagram-aware AI",
    body: "Claude reads your architecture diagram or text description and identifies every cloud resource and connection.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 12h4l3-9 4 18 3-9h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Production-ready Terraform",
    body: "Get well-formatted main.tf, variables.tf, outputs.tf, and providers.tf — pinned versions, secure defaults, and clear comments.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m9 11 3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "AWS · Azure · GCP",
    body: "Covers VPC, EC2/VM/GCE, RDS/Cloud SQL, S3/GCS, Lambda/Functions, Kubernetes, IAM, and more on every major cloud.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <ellipse cx="12" cy="12" rx="10" ry="4" strokeLinecap="round" />
        <path d="M2 12c0 5.5 4.5 10 10 10s10-4.5 10-10" strokeLinecap="round" />
        <path d="M2 12c0-5.5 4.5-10 10-10s10 4.5 10 10" strokeLinecap="round" />
      </svg>
    ),
  },
];

const STEPS = [
  { n: "01", title: "Upload your diagram", body: "PNG, JPG, or describe it in plain English." },
  { n: "02", title: "Pick AWS, Azure, or GCP", body: "Choose your target cloud and environment." },
  { n: "03", title: "Get Terraform code", body: "View it, copy it, or download the ZIP." },
];

export default function Home() {
  return (
    <main>
      <section className="container-page pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="badge mb-6 border-brand-300/30 bg-brand-300/10 text-brand-200">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
            Powered by Claude vision
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Draw it. Upload it.{" "}
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-accent-400 bg-clip-text text-transparent">
              Get the Terraform.
            </span>
          </h1>
          <p className="mt-6 text-base text-slate-300 sm:text-lg">
            TerraSketch turns any cloud architecture diagram into clean,
            production-ready Terraform for AWS, Azure, or GCP — in seconds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/generate" className="btn-primary">
              Generate Terraform
            </Link>
            <Link to="/docs" className="btn-secondary">
              How it works
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/30 text-brand-200">
                <span className="block h-5 w-5">{f.icon}</span>
              </div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page pb-24">
        <div className="card p-6 sm:p-10">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            How it works
          </h2>
          <p className="mt-1 text-sm text-slate-400">Three steps. No setup.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
                <span className="font-mono text-sm text-brand-300">{s.n}</span>
                <h4 className="mt-1 font-semibold text-white">{s.title}</h4>
                <p className="mt-1 text-sm text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Link to="/generate" className="btn-primary">
              Try it free →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
