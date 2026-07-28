import React, { useState } from "react";
import MermaidExport from "../components/insights/MermaidExport.jsx";
import Button from "../components/shared/Button.jsx";

const SAMPLE = `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_lb" "app" {
  subnets = [aws_subnet.public.id]
}

resource "aws_instance" "web" {
  subnet_id = aws_subnet.public.id
}

resource "aws_db_instance" "db" {
  engine = "mysql"
}
`;

export default function ReverseDiagram() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState("");

  const draw = () => setSubmitted(code);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setCode(text);
    setSubmitted(text);
    e.target.value = "";
  };

  return (
    <main className="container-page min-w-0 py-6 sm:py-10 md:py-14">
      <div className="mx-auto w-full min-w-0 max-w-4xl">
        <header className="mb-8">
          <h1 className="heading-display text-3xl sm:text-4xl">Terraform → Diagram</h1>
          <p className="mt-2 text-sm text-slate-400">
            The reverse of what TerraSketch usually does — paste existing Terraform (or upload a
            <code className="mx-1 rounded bg-white/10 px-1">.tf</code>file) and get an architecture
            diagram of what it builds. Runs entirely in your browser.
          </p>
        </header>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}'}
          spellCheck={false}
          className="h-64 w-full resize-y rounded-xl border border-white/10 bg-slate-900/60 p-4 font-mono text-sm text-slate-100 outline-none focus:border-brand-400/60"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={draw} disabled={!code.trim()} className="py-2.5">
            Draw diagram
          </Button>
          <label className="cursor-pointer text-sm text-slate-300 underline underline-offset-4 hover:text-slate-100">
            Upload a .tf file
            <input type="file" accept=".tf,.txt,.hcl" onChange={onFile} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => {
              setCode(SAMPLE);
              setSubmitted(SAMPLE);
            }}
            className="text-sm text-slate-400 underline underline-offset-4 hover:text-slate-200"
          >
            Try a sample
          </button>
        </div>

        {submitted.trim() && (
          <div className="mt-8">
            <MermaidExport files={{ "main.tf": submitted }} />
          </div>
        )}
      </div>
    </main>
  );
}
