#!/usr/bin/env python3
"""Feedback-to-prompt retraining pipeline.

Reads low-rated generations from the Feedback table, analyses failure patterns,
and generates prompt improvement suggestions using the LLM.

Output:
  - Console report of patterns
  - prompt_suggestions.json with concrete prompt improvements
  - few_shot_negatives.json with examples to add to the system prompt

Usage:
    cd backend
    DATABASE_URL=... python scripts/feedback_retraining.py [--threshold 2] [--out-dir ./retraining]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("DATABASE_URL", "sqlite:///./terrasketch.db")


def _load_low_rated(db, threshold: int, limit: int) -> list[dict]:
    from app.db.models import Feedback, Generation
    rows = (
        db.query(Feedback, Generation)
        .join(Generation, Feedback.generation_id == Generation.id)
        .filter(Feedback.rating <= threshold)
        .order_by(Feedback.created_at.desc())
        .limit(limit)
        .all()
    )
    results = []
    for fb, gen in rows:
        results.append({
            "generation_id": gen.id,
            "rating": fb.rating,
            "comment": fb.comment or "",
            "cloud_provider": gen.cloud_provider,
            "environment": gen.environment,
            "input_type": gen.input_type,
            "resources_identified": gen.resources_identified or [],
            "assumptions": gen.assumptions or [],
            "diagram_match_percent": gen.diagram_match_percent,
            "security_warnings": gen.security_warnings or [],
            "terraform_validation": gen.terraform_validation,
            "generated_files": gen.generated_files or {},
        })
    return results


def _analyse_patterns(samples: list[dict]) -> dict:
    providers = Counter(s["cloud_provider"] for s in samples)
    low_match = [s for s in samples if (s["diagram_match_percent"] or 0) < 60]
    has_security = [s for s in samples if s["security_warnings"]]
    val_failed = [s for s in samples if (s.get("terraform_validation") or {}).get("validate", {}).get("valid") is False]
    comments = [s["comment"] for s in samples if s["comment"].strip()]

    return {
        "total_low_rated": len(samples),
        "by_provider": dict(providers),
        "low_diagram_match_count": len(low_match),
        "has_security_warnings_count": len(has_security),
        "validation_failed_count": len(val_failed),
        "user_comments": comments[:20],
        "avg_match": round(
            sum((s["diagram_match_percent"] or 0) for s in samples) / max(len(samples), 1), 1
        ),
    }


async def _generate_suggestions(patterns: dict, samples: list[dict]) -> dict:
    """Use the LLM to suggest concrete prompt improvements based on failure patterns."""
    from app.core.config import get_settings
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        return {"suggestions": [], "note": "No ANTHROPIC_API_KEY — LLM suggestions skipped"}

    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = json.dumps(patterns, indent=2)
    sample_slice = json.dumps(samples[:5], indent=2)

    prompt = f"""You are reviewing low-rated Terraform generation outputs to improve the system prompt.

Pattern analysis of {patterns['total_low_rated']} low-rated generations:
{context}

Sample failed generations (first 5):
{sample_slice}

Based on these failures, suggest:
1. Specific rules to ADD to the system prompt to prevent these failures
2. Specific rules to MODIFY in the system prompt
3. Few-shot negative examples (show what NOT to do)

Return a JSON object:
{{
  "rules_to_add": ["rule text..."],
  "rules_to_modify": [{{"original": "...", "improved": "..."}}],
  "few_shot_negatives": [{{"pattern": "...", "example": "...", "why_bad": "..."}}],
  "root_cause_summary": "..."
}}"""

    try:
        resp = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        # Extract JSON
        import re
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as exc:
        return {"error": str(exc), "suggestions": []}
    return {"suggestions": [], "raw": text}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Feedback-to-prompt retraining")
    parser.add_argument("--threshold", type=int, default=2)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--out-dir", default="./retraining")
    args = parser.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        samples = _load_low_rated(db, args.threshold, args.limit)
    finally:
        db.close()

    if not samples:
        print(f"No generations with rating <= {args.threshold} found.")
        return

    print(f"Loaded {len(samples)} low-rated generations (rating <= {args.threshold})")

    patterns = _analyse_patterns(samples)
    print("\n=== Pattern Analysis ===")
    print(f"Total low-rated:        {patterns['total_low_rated']}")
    print(f"By provider:            {patterns['by_provider']}")
    print(f"Low diagram match (<60): {patterns['low_diagram_match_count']}")
    print(f"Has security warnings:   {patterns['has_security_warnings_count']}")
    print(f"Validation failed:       {patterns['validation_failed_count']}")
    print(f"Avg match score:         {patterns['avg_match']}%")

    if patterns["user_comments"]:
        print("\nUser comments:")
        for c in patterns["user_comments"][:5]:
            print(f"  - {c[:100]}")

    # Save patterns
    (out / "patterns.json").write_text(json.dumps(patterns, indent=2))

    # LLM suggestions
    print("\nGenerating prompt improvement suggestions...")
    suggestions = await _generate_suggestions(patterns, samples)
    (out / "prompt_suggestions.json").write_text(json.dumps(suggestions, indent=2))

    if "rules_to_add" in suggestions:
        print("\n=== Suggested new rules ===")
        for rule in suggestions.get("rules_to_add", []):
            print(f"  + {rule}")

    if "root_cause_summary" in suggestions:
        print(f"\nRoot cause: {suggestions['root_cause_summary']}")

    # Save negative examples
    negatives = [s for s in samples if (s.get("diagram_match_percent") or 0) < 50]
    (out / "few_shot_negatives.json").write_text(json.dumps(negatives[:10], indent=2))

    print(f"\nOutputs written to {out}/")
    print("  patterns.json        — failure pattern analysis")
    print("  prompt_suggestions.json — LLM-generated improvement suggestions")
    print("  few_shot_negatives.json — low-match examples for negative few-shot")


if __name__ == "__main__":
    asyncio.run(main())
