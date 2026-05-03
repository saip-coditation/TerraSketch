"""Add password_hash, marketing_opt_in; index generations.user_id.

Revision ID: 0003_user_auth
Revises: 0002_generation_insights
Create Date: 2026-05-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_user_auth"
down_revision: Union[str, None] = "0002_generation_insights"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column(
                "marketing_opt_in",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    op.create_index("ix_generations_user_id", "generations", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_generations_user_id", table_name="generations")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("marketing_opt_in")
        batch_op.drop_column("password_hash")
