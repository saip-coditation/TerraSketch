#!/usr/bin/env python3
"""Benchmark v1 vs v2 generation on a set of example diagrams.

Usage:
    cd backend
    ANTHROPIC_API_KEY=... python scripts/benchmark_v1_v2.py [--diagrams examples/]

Metrics per diagram:
    - latency (seconds)
    - token cost (input + output)
    - validate pass/fail (v2 only, via ValidationReport)
    - resources identified count
    - fixer iterations (v2 only)

Results are written to benchmark_results.json.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path

# Ensure we can import app modules from the backend directory
sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("DATABASE_URL", "sqlite:///./terrasketch.db")


async def _run_v2(image_b64: str | None, text: str | None, cloud_provider: str) -> dict:
    from app.agents.graph import run_graph

    start = time.perf_counter()
    result = await run_graph(
        cloud_provider=cloud_provider,
        environment="dev",
        image_base64=image_b64,
        text_description=text,
    )
    elapsed = time.perf_counter() - start

    # Aggregate token counts from all node outputs
    trace = result.trace
    nodes = [trace.understand, trace.plan, trace.synthesize, trace.validate_node]
    nodes += trace.fixer_iterations or []
    total_in = sum((n.input_tokens for n in nodes if n), 0)
    total_out = sum((n.output_tokens for n in nodes if n), 0)

    return {
        "version": "v2",
        "latency_s": round(elapsed, 2),
        "input_tokens": total_in,
        "output_tokens": total_out,
        "resources_identified": len(result.resource_plan.resources) if result.resource_plan else 0,
        "validation_passed": result.validation.valid if result.validation else None,
        "fixer_iterations": len(trace.fixer_iterations),
        "error": result.error,
    }


def _run_v1(image_b64: str | None, text: str | None, cloud_provider: str) -> dict:
    from app.services.llm.router import generate_terraform

    start = time.perf_counter()
    try:
        output = generate_terraform(
            cloud_provider=cloud_provider,
            environment="dev",
            input_type="image" if image_b64 else "text",
            image_base64=image_b64,
            text_description=text,
        )
        elapsed = time.perf_counter() - start
        return {
            "version": "v1",
            "latency_s": round(elapsed, 2),
            "input_tokens": 0,
            "output_tokens": 0,
            "resources_identified": len(output.resources_identified or []),
            "validation_passed": None,
            "fixer_iterations": 0,
            "error": None,
        }
    except Exception as exc:
        elapsed = time.perf_counter() - start
        return {
            "version": "v1",
            "latency_s": round(elapsed, 2),
            "error": str(exc),
        }


async def benchmark_diagram(path: Path, cloud_provider: str) -> dict:
    image_b64 = None
    text = None

    if path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        image_b64 = base64.b64encode(path.read_bytes()).decode()
    else:
        text = path.read_text(encoding="utf-8")

    v1 = _run_v1(image_b64, text, cloud_provider)
    v2 = await _run_v2(image_b64, text, cloud_provider)

    return {
        "diagram": str(path),
        "cloud_provider": cloud_provider,
        "v1": v1,
        "v2": v2,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark v1 vs v2 generation")
    parser.add_argument("--diagrams", default="../examples/", help="Directory with example diagrams")
    parser.add_argument("--provider", default="aws", choices=["aws", "azure", "gcp"])
    parser.add_argument("--out", default="benchmark_results.json")
    args = parser.parse_args()

    diagrams_dir = Path(args.diagrams)
    extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md"}
    diagrams = [p for p in diagrams_dir.rglob("*") if p.suffix.lower() in extensions]

    if not diagrams:
        print(f"No diagrams found in {diagrams_dir}")
        return

    print(f"Benchmarking {len(diagrams)} diagram(s) against v1 and v2…")
    results = []
    for path in diagrams:
        print(f"  {path.name}…", end=" ", flush=True)
        try:
            r = await benchmark_diagram(path, args.provider)
            results.append(r)
            v1_lat = r["v1"].get("latency_s", "?")
            v2_lat = r["v2"].get("latency_s", "?")
            v2_pass = r["v2"].get("validation_passed")
            print(f"v1={v1_lat}s v2={v2_lat}s valid={v2_pass}")
        except Exception as exc:
            print(f"ERROR: {exc}")
            results.append({"diagram": str(path), "error": str(exc)})

    out_path = Path(args.out)
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults written to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
