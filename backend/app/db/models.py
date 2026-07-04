"""SQLAlchemy ORM models for TerraSketch.

Mirrors the schema described in the product document. UUIDs are stored
as strings to keep compatibility with both Postgres and SQLite (used
for local development).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), default="email", nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    marketing_opt_in: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    generations: Mapped[list[Generation]] = relationship(back_populates="user")


class Generation(Base):
    __tablename__ = "generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    cloud_provider: Mapped[str] = mapped_column(String(20), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), default="dev", nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)
    input_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    resources_identified: Mapped[list | None] = mapped_column(JSON, nullable=True)
    assumptions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    generated_files: Mapped[dict] = mapped_column(JSON, nullable=False)
    usage_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    diagram_match_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    improvement_advice: Mapped[list | None] = mapped_column(JSON, nullable=True)
    security_warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    confidence_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    placeholders: Mapped[list | None] = mapped_column(JSON, nullable=True)
    terraform_validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    file_diff_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    agent_trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User | None] = relationship(back_populates="generations")
    feedback: Mapped[list[Feedback]] = relationship(back_populates="generation")


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    generation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("generations.id"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    feedback_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    generation: Mapped[Generation] = relationship(back_populates="feedback")
    user: Mapped[User | None] = relationship()


class UserPreference(Base):
    """Per-user preferences mined from critique dismissals and explicit settings.

    dismissed_findings: JSON list of finding strings the user has dismissed.
    custom: arbitrary key-value settings (e.g. preferred region, default environment).
    """

    __tablename__ = "preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    dismissed_findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    custom: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Deployment(Base):
    """A deploy job (apply/destroy). State + files are persisted so a server
    restart never orphans a running stack. AWS keys are NEVER stored here —
    they stay in the backend process memory only."""

    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    generation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    action: Mapped[str] = mapped_column(String(20), default="apply", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    region: Mapped[str] = mapped_column(String(40), default="us-east-1", nullable=False)

    files: Mapped[dict] = mapped_column(JSON, nullable=False)
    state: Mapped[str | None] = mapped_column(Text, nullable=True)
    outputs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
