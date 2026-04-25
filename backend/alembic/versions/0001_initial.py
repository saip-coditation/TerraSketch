"""Initial schema: users, generations, feedback.

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="email"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "generations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cloud_provider", sa.String(length=20), nullable=False),
        sa.Column("environment", sa.String(length=20), nullable=False, server_default="dev"),
        sa.Column("input_type", sa.String(length=20), nullable=False),
        sa.Column("input_description", sa.Text(), nullable=True),
        sa.Column("resources_identified", sa.JSON(), nullable=True),
        sa.Column("assumptions", sa.JSON(), nullable=True),
        sa.Column("generated_files", sa.JSON(), nullable=False),
        sa.Column("usage_instructions", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_generations_session_id",
        "generations",
        ["session_id"],
    )

    op.create_table(
        "feedback",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "generation_id",
            sa.String(length=36),
            sa.ForeignKey("generations.id"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
    )


def downgrade() -> None:
    op.drop_table("feedback")
    op.drop_index("ix_generations_session_id", table_name="generations")
    op.drop_table("generations")
    op.drop_table("users")
