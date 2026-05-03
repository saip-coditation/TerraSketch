"""Add diagram match, security, validation, and diff columns to generations.

Revision ID: 0002_generation_insights
Revises: 0001_initial
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_generation_insights"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("generations", sa.Column("diagram_match_percent", sa.Integer(), nullable=True))
    op.add_column("generations", sa.Column("improvement_advice", sa.JSON(), nullable=True))
    op.add_column("generations", sa.Column("security_warnings", sa.JSON(), nullable=True))
    op.add_column("generations", sa.Column("terraform_validation", sa.JSON(), nullable=True))
    op.add_column("generations", sa.Column("file_diff_summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("generations", "file_diff_summary")
    op.drop_column("generations", "terraform_validation")
    op.drop_column("generations", "security_warnings")
    op.drop_column("generations", "improvement_advice")
    op.drop_column("generations", "diagram_match_percent")
