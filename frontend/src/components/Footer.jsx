import React from "react";

export default function Footer() {
  return (
    <footer className="safe-bottom mt-16 border-t border-white/5">
      <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-center text-sm text-slate-400 sm:flex-row sm:py-8 sm:text-left">
        <p className="max-w-prose break-words">
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
