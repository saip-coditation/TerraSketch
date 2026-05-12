"""Per-user preference reader/writer backed by the preferences table (migration 0005)."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.state import DiagramIR, GenerationTrace, TerraformFiles
from app.db.models import UserPreference
from app.services.memory import PastRun, Preferences

logger = logging.getLogger(__name__)


class SqlPreferencesMemory:
    def __init__(self, db: Session) -> None:
        self._db = db

    async def retrieve_similar(self, ir: DiagramIR, k: int = 3) -> list[PastRun]:
        return []

    async def get_preferences(self, user_id: str | None) -> Preferences:
        if not user_id:
            return Preferences()
        try:
            pref = self._db.query(UserPreference).filter_by(user_id=user_id).first()
            if pref:
                return Preferences(
                    dismissed_findings=list(pref.dismissed_findings or []),
                    custom=dict(pref.custom or {}),
                )
        except Exception as exc:
            logger.warning("Failed to load preferences for user %s: %s", user_id, exc)
        return Preferences()

    async def dismiss_finding(self, user_id: str, finding: str) -> None:
        """Record that a user has dismissed a critique finding."""
        try:
            pref = self._db.query(UserPreference).filter_by(user_id=user_id).first()
            if pref is None:
                pref = UserPreference(user_id=user_id, dismissed_findings=[], updated_at=datetime.utcnow())
                self._db.add(pref)
            current = list(pref.dismissed_findings or [])
            if finding not in current:
                current.append(finding)
                pref.dismissed_findings = current
                pref.updated_at = datetime.utcnow()
            self._db.commit()
        except Exception as exc:
            logger.warning("Failed to dismiss finding for user %s: %s", user_id, exc)
            self._db.rollback()

    async def record_run(self, trace: GenerationTrace, files: TerraformFiles | None) -> None:
        pass
