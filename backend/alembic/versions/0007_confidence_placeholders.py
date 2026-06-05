"""Add confidence_scores and placeholders columns to generations table.

Revision ID: 0007_confidence_placeholders
Revises: 0006_feedback_user_type
Create Date: 2026-06-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_confidence_placeholders"
down_revision: Union[str, None] = "0006_feedback_user_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("generations", sa.Column("confidence_scores", sa.JSON(), nullable=True))
    op.add_column("generations", sa.Column("placeholders", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("generations", "placeholders")
    op.drop_column("generations", "confidence_scores")
