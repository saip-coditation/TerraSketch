"""Semantic retrieval of past runs via pgvector.

Gracefully degrades when pgvector extension is not installed:
- Falls back to keyword search on resources_identified (SQL LIKE)
- No crash, no config change needed

Full activation requires:
  1. Postgres with pgvector: CREATE EXTENSION IF NOT EXISTS vector;
  2. Run migration 0006_pgvector (adds embedding column to generations)
  3. Set OPENAI_API_KEY or use a local embedding model

Usage in Plan node:
    from app.services.memory.pgvector import PgvectorMemory
    from app.db.session import SessionLocal
    db = SessionLocal()
    mem = PgvectorMemory(db)
    similar = await mem.retrieve_similar(state.diagram_ir, k=3)
    # inject as RetrievedContext into ContextBuilder
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.agents.state import DiagramIR, GenerationTrace, TerraformFiles
from app.services.memory import PastRun, Preferences

logger = logging.getLogger(__name__)

_PGVECTOR_AVAILABLE: bool | None = None
_EMBEDDING_DIM = 1536  # text-embedding-3-small


def _check_pgvector(db: Session) -> bool:
    global _PGVECTOR_AVAILABLE
    if _PGVECTOR_AVAILABLE is not None:
        return _PGVECTOR_AVAILABLE
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1 FROM pg_extension WHERE extname='vector'"))
        _PGVECTOR_AVAILABLE = True
    except Exception:
        _PGVECTOR_AVAILABLE = False
    return _PGVECTOR_AVAILABLE


async def _embed(text: str) -> list[float] | None:
    """Embed text using OpenAI text-embedding-3-small. Returns None on failure."""
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI()
        resp = await client.embeddings.create(model="text-embedding-3-small", input=text[:8000])
        return resp.data[0].embedding
    except Exception as exc:
        logger.debug("Embedding failed (will use keyword fallback): %s", exc)
        return None


def _ir_to_text(ir: DiagramIR) -> str:
    """Convert DiagramIR to a text representation for embedding."""
    parts = [f"{n.kind}:{n.label}" for n in ir.nodes]
    edges = [f"{e.source}->{e.target}" for e in ir.edges]
    return " ".join(parts) + " | " + " ".join(edges)


class PgvectorMemory:
    """Semantic past-run retrieval.

    When pgvector is available: uses cosine similarity on embeddings.
    When not available: falls back to keyword overlap on resources_identified.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    async def retrieve_similar(self, ir: DiagramIR, k: int = 3) -> list[PastRun]:
        from app.db.models import Generation
        import sqlalchemy as sa

        ir_text = _ir_to_text(ir)
        results: list[PastRun] = []

        has_pgvector = _check_pgvector(self._db)

        if has_pgvector:
            # Try vector similarity search
            embedding = await _embed(ir_text)
            if embedding is not None:
                try:
                    rows = self._db.execute(
                        sa.text(
                            "SELECT id, resources_identified, generated_files, agent_trace "
                            "FROM generations "
                            "WHERE embedding IS NOT NULL "
                            "ORDER BY embedding <=> CAST(:emb AS vector) "
                            "LIMIT :k"
                        ),
                        {"emb": json.dumps(embedding), "k": k},
                    ).fetchall()

                    for row in rows:
                        results.append(PastRun(
                            generation_id=row[0],
                            diagram_ir=None,
                            files=None,
                            validation_passed=True,
                            trace_summary=f"resources: {row[1]}",
                        ))
                    logger.info("pgvector retrieved %d similar runs", len(results))
                    return results
                except Exception as exc:
                    logger.warning("pgvector query failed, falling back to keyword: %s", exc)

        # Keyword fallback: find generations with overlapping resource types
        ir_kinds = {n.kind.lower() for n in ir.nodes if n.kind}
        if not ir_kinds:
            return []

        try:
            rows = (
                self._db.query(Generation)
                .filter(Generation.resources_identified.isnot(None))
                .order_by(Generation.created_at.desc())
                .limit(50)
                .all()
            )

            scored: list[tuple[float, Generation]] = []
            for row in rows:
                res_ids = [r.lower() for r in (row.resources_identified or [])]
                overlap = sum(1 for k in ir_kinds if any(k in r for r in res_ids))
                if overlap > 0:
                    scored.append((overlap / len(ir_kinds), row))

            scored.sort(key=lambda x: -x[0])
            for score, row in scored[:k]:
                results.append(PastRun(
                    generation_id=row.id,
                    diagram_ir=None,
                    files=None,
                    validation_passed=(row.terraform_validation or {}).get("validate", {}).get("valid", False),
                    trace_summary=f"keyword_overlap={score:.2f} resources={row.resources_identified}",
                ))
            logger.info("Keyword fallback retrieved %d similar runs", len(results))
        except Exception as exc:
            logger.warning("Keyword similarity search failed: %s", exc)

        return results

    async def get_preferences(self, user_id: str | None) -> Preferences:
        if not user_id:
            return Preferences()
        try:
            from app.db.models import UserPreference
            pref = self._db.query(UserPreference).filter_by(user_id=user_id).first()
            if pref:
                return Preferences(
                    dismissed_findings=list(pref.dismissed_findings or []),
                    custom=dict(pref.custom or {}),
                )
        except Exception as exc:
            logger.warning("get_preferences failed: %s", exc)
        return Preferences()

    async def record_run(self, trace: GenerationTrace, files: TerraformFiles | None) -> None:
        """Store the run embedding for future retrieval (no-op if embedding unavailable)."""
        if not has_pgvector or not files:
            return

        summary = (
            f"provider={trace.cloud_provider} env={trace.environment} "
            f"nodes={len(trace.understand.decisions) if trace.understand else 0}"
        )
        embedding = await _embed(summary)
        if embedding is None:
            return

        try:
            import sqlalchemy as sa
            self._db.execute(
                sa.text(
                    "UPDATE generations SET embedding = CAST(:emb AS vector) "
                    "WHERE id = (SELECT id FROM generations ORDER BY created_at DESC LIMIT 1)"
                ),
                {"emb": json.dumps(embedding)},
            )
            self._db.commit()
        except Exception as exc:
            logger.debug("record_run embedding update failed: %s", exc)
            self._db.rollback()
