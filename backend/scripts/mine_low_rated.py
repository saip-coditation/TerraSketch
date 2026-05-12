#!/usr/bin/env python3
"""Weekly script to surface low-rated generations for prompt improvement.

Reads the Feedback table, groups by generation, and prints/exports
low-rated examples (rating <= 2) with their generated files and assumptions.
These are candidates for:
  - Adding as negative few-shot examples to the system prompt.
  - Identifying recurring failure patterns.
  - Surfacing to the team for manual review.

Usage:
    cd backend
    DATABASE_URL=postgresql://... python scripts/mine_low_rated.py [--threshold 2] [--out low_rated.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("DATABASE_URL", "sqlite:///./terrasketch.db")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mine low-rated generations for prompt improvement")
    parser.add_argument("--threshold", type=int, default=2, help="Max rating to consider low (1-5)")
    parser.add_argument("--out", default="low_rated.json", help="Output file path")
    parser.add_argument("--limit", type=int, default=100, help="Max results to export")
    args = parser.parse_args()

    from app.db.session import SessionLocal
    from app.db.models import Feedback, Generation

    db = SessionLocal()
    try:
        low_feedback = (
            db.query(Feedback)
            .filter(Feedback.rating <= args.threshold)
            .order_by(Feedback.created_at.desc())
            .limit(args.limit)
            .all()
        )

        results = []
        for fb in low_feedback:
            gen = db.get(Generation, fb.generation_id)
            if not gen:
                continue
            results.append({
                "generation_id": fb.generation_id,
                "rating": fb.rating,
                "comment": fb.comment,
                "cloud_provider": gen.cloud_provider,
                "environment": gen.environment,
                "input_type": gen.input_type,
                "resources_identified": gen.resources_identified or [],
                "assumptions": gen.assumptions or [],
                "diagram_match_percent": gen.diagram_match_percent,
                "feedback_created_at": fb.created_at.isoformat(),
                "generation_created_at": gen.created_at.isoformat(),
            })

        out_path = Path(args.out)
        out_path.write_text(json.dumps(results, indent=2))

        print(f"Found {len(results)} low-rated generation(s) (rating <= {args.threshold})")
        print(f"Exported to {out_path}")

        # Summary by provider
        by_provider: dict[str, int] = {}
        for r in results:
            p = r["cloud_provider"]
            by_provider[p] = by_provider.get(p, 0) + 1
        for p, count in sorted(by_provider.items(), key=lambda x: -x[1]):
            print(f"  {p}: {count}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
