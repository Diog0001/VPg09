from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid4())


class TaskStatus(StrEnum):
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    REVIEW = "review"
    DONE = "done"
    ARCHIVED = "archived"


class TaskPriority(StrEnum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RelationKind(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    KEY = "key"


class RelationType(StrEnum):
    PARENT_OF = "parent_of"
    NEXT = "next"
    DEPENDS_ON = "depends_on"
    RELATES_TO = "relates_to"
    INSPIRED_BY = "inspired_by"
    SUPPORTS = "supports"
    DERIVES_FROM = "derives_from"
    PART_OF_KEY = "part_of_key"
    IMPLEMENTS = "implements"
    BLOCKS = "blocks"
    DUPLICATES = "duplicates"
    CONTRADICTS = "contradicts"


class TaskEditor(StrEnum):
    MARKDOWN = "markdown"
    CANVAS = "canvas"
    DESIGN = "design"
    MIXED = "mixed"


class MembershipRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="workspace")
    tasks: Mapped[list["Task"]] = relationship(back_populates="workspace")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_membership"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default=MembershipRole.MEMBER.value)

    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class TaskType(Base):
    __tablename__ = "task_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scope: Mapped[str] = mapped_column(String(20), default="global")
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id"), nullable=True)
    slug: Mapped[str] = mapped_column(String(80), index=True)
    label: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str] = mapped_column(String(40), default="task")
    color: Mapped[str] = mapped_column(String(16), default="#fb605e")
    built_in: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    editor: Mapped[str] = mapped_column(String(20), default=TaskEditor.MARKDOWN.value)
    show_status: Mapped[bool] = mapped_column(Boolean, default=True)
    show_assignee: Mapped[bool] = mapped_column(Boolean, default=True)
    show_due_date: Mapped[bool] = mapped_column(Boolean, default=True)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    type_id: Mapped[str] = mapped_column(ForeignKey("task_types.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default=TaskStatus.TODO.value, index=True)
    priority: Mapped[str] = mapped_column(String(20), default=TaskPriority.NONE.value)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped[Workspace] = relationship(back_populates="tasks")
    type: Mapped[TaskType] = relationship()


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "target_id", "kind", "relation_type", name="uq_edge_pair_kind_type"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    target_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default=RelationKind.PRIMARY.value, index=True)
    relation_type: Mapped[str] = mapped_column(String(40), default=RelationType.NEXT.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ViewState(Base):
    __tablename__ = "view_states"
    __table_args__ = (
        UniqueConstraint("workspace_id", "focus_task_id", "user_id", name="uq_view_state"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    focus_task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    positions: Mapped[dict] = mapped_column(JSON, default=dict)
    pinned_ids: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
