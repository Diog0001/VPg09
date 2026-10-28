"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_membership"),
    )
    op.create_table(
        "task_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("icon", sa.String(40), nullable=False),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("built_in", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("editor", sa.String(20), nullable=False),
        sa.Column("show_status", sa.Boolean(), nullable=False),
        sa.Column("show_assignee", sa.Boolean(), nullable=False),
        sa.Column("show_due_date", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("type_id", sa.String(36), sa.ForeignKey("task_types.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "edges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("target_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("relation_type", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source_id", "target_id", "kind", "relation_type", name="uq_edge_pair_kind_type"),
    )
    op.create_table(
        "view_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("focus_task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("positions", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("workspace_id", "focus_task_id", "user_id", name="uq_view_state"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"])
    op.create_index("ix_tasks_workspace_id", "tasks", ["workspace_id"])
    op.create_index("ix_tasks_type_id", "tasks", ["type_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])
    op.create_index("ix_edges_workspace_id", "edges", ["workspace_id"])
    op.create_index("ix_edges_source_id", "edges", ["source_id"])
    op.create_index("ix_edges_target_id", "edges", ["target_id"])
    op.create_index("ix_edges_kind", "edges", ["kind"])


def downgrade() -> None:
    op.drop_table("view_states")
    op.drop_table("edges")
    op.drop_table("tasks")
    op.drop_table("task_types")
    op.drop_table("memberships")
    op.drop_table("workspaces")
    op.drop_table("users")
