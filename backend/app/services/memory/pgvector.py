"""Semantic retrieval of past runs via pgvector.

Requires the pgvector Postgres extension and the `pgvector` Python package.
Embedding model: text-embedding-3-small (OpenAI) or equivalent.

Usage: call `PgvectorMemory(db).retrieve_similar(ir, k=3)` from Plan node
to inject few-shot examples of similar past runs that validated cleanly.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.agents.state import DiagramIR, GenerationTrace, TerraformFiles
from app.services.memory import PastRun, Preferences

logger = logging.getLogger(__name__)


class PgvectorMemory:
    def __init__(self, db: Session) -> None:
        self._db = db

    def _embed(self, text: str) -> list[float]:
        """Embed text using OpenAI embeddings. Falls back to empty on error."""
        try:
            from openai import OpenAI
            client = OpenAI()
            resp = client.embeddings.create(model="text-embedding-3-small", input=text)
            return resp.data[0].embedding
        except Exception as exc:
            logger.warning("Embedding failed, skipping semantic retrieval: %s", exc)
            return []

    async def retrieve_similar(self, ir: DiagramIR, k: int = 3) -> list[PastRun]:
        # pgvector retrieval requires the extension and a vector column on generations.
        # This is a stub until migration 0005_pgvector is applied.
        return []

    async def get_preferences(self, user_id: str | None) -> Preferences:
        return Preferences()

    async def record_run(self, trace: GenerationTrace, files: TerraformFiles | None) -> None:
        # Stub: embed trace summary and upsert into vector store.
        pass
