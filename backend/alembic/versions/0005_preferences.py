"""Add preferences table for per-user critique dismissals and settings.

Revision ID: 0005_preferences
Revises: 0004_agent_trace
Create Date: 2026-05-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_preferences"
down_revision: Union[str, None] = "0004_agent_trace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "preferences",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("dismissed_findings", sa.JSON(), nullable=True),
        sa.Column("custom", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_preferences_user_id", "preferences", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_preferences_user_id", table_name="preferences")
    op.drop_table("preferences")
