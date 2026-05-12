"""Add agent_trace and raw_response columns to generations.

Revision ID: 0004_agent_trace
Revises: 0003_user_auth
Create Date: 2026-05-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_agent_trace"
down_revision: Union[str, None] = "0003_user_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("generations") as batch_op:
        batch_op.add_column(sa.Column("agent_trace", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("raw_response", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("generations") as batch_op:
        batch_op.drop_column("raw_response")
        batch_op.drop_column("agent_trace")
