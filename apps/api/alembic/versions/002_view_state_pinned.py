"""store pinned constructor tasks

Revision ID: 002
Revises: 001
Create Date: 2026-10-10
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "view_states",
        sa.Column("pinned_ids", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("view_states", "pinned_ids")
