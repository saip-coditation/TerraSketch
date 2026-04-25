import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 mt-16">
      <div className="container-page flex flex-col items-center justify-between gap-2 py-8 text-sm text-slate-400 sm:flex-row">
        <p>
          TerraSketch — diagram &rarr; Terraform, instantly. Built with React,
          FastAPI, and Claude.
        </p>
        <p className="text-slate-500">
          v1.0 · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
