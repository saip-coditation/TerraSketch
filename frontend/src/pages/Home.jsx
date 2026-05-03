import React from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Diagram-aware AI",
    body: "Vision + text: identify services, connections, and tiers — then emit structured Terraform.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 12h4l3-9 4 18 3-9h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Match score & advice",
    body: "See how closely output matches common AWS / Azure / GCP patterns, with concrete next fixes.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 20V10M6 20V4M18 20v-6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Safety rails",
    body: "Lightweight secret heuristics, optional terraform validate/fmt when CLI is on the server.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEPS = [
  { n: "01", title: "Upload or describe", body: "PNG/JPG diagram or plain-English architecture." },
  { n: "02", title: "Pick preset & cloud", body: "Simple web, microservice, serverless — AWS, Azure, or GCP." },
  { n: "03", title: "Iterate with diffs", body: "Compare to your last run, copy files, download ZIP, push to git." },
];

export default function Home() {
  return (
    <main className="min-w-0">
      <section className="container-page min-w-0 pb-12 pt-8 sm:pb-16 sm:pt-14 md:pb-24 md:pt-20">
        <div className="mesh-hero relative overflow-hidden px-3 py-10 sm:px-8 sm:py-14 md:px-12 md:py-20">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="badge mb-6 border-brand-300/30 bg-brand-300/10 text-brand-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300 shadow-[0_0_12px_rgba(56,189,248,0.9)]" />
              Architecture → IaC
            </span>
            <h1 className="heading-display break-words text-[1.65rem] leading-tight sm:text-4xl md:text-6xl md:leading-[1.05]">
              Draw it. Upload it.{" "}
              <span className="bg-gradient-to-r from-brand-200 via-brand-400 to-accent-400 bg-clip-text text-transparent">
                Ship Terraform.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-slate-200/90 sm:text-lg">
              TerraSketch turns diagrams into clean HCL — with match scoring, improvement tips,
              optional validation, and a polished studio for your team.
            </p>
            <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:mx-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
              <Link
                to="/generate"
                className="btn-primary w-full justify-center px-6 py-3 text-base shadow-glow sm:w-auto sm:py-2.5"
              >
                Open studio
              </Link>
              <Link
                to="/docs"
                className="btn-secondary w-full justify-center px-6 py-3 text-base sm:w-auto sm:py-2.5"
              >
                Documentation
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page min-w-0 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-glow p-6 transition hover:bg-white/[0.08]">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/35 to-accent-500/25 text-brand-200 shadow-glow">
                <span className="block h-5 w-5">{f.icon}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page min-w-0 pb-24">
        <div className="card p-6 sm:p-10">
          <h2 className="heading-display text-2xl sm:text-3xl">How it works</h2>
          <p className="mt-1 text-sm text-slate-400">Three steps — from sketch to repo-ready files.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-5"
              >
                <span className="font-mono text-sm font-semibold text-brand-300">{s.n}</span>
                <h4 className="mt-2 font-display text-base font-semibold text-white">{s.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Link to="/generate" className="btn-primary px-8">
              Start generating →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
