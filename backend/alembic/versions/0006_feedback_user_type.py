"""Add user_id and feedback_type columns to feedback table.

Revision ID: 0006_feedback_user_type
Revises: 0005_preferences
Create Date: 2026-05-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_feedback_user_type"
down_revision: Union[str, None] = "0005_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("feedback", sa.Column("feedback_type", sa.String(50), nullable=True))
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_column("feedback", "feedback_type")
    op.drop_column("feedback", "user_id")
