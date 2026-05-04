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
    terraform_validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    file_diff_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

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
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    generation: Mapped[Generation] = relationship(back_populates="feedback")
