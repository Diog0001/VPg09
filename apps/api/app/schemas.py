from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str


class LoginIn(BaseModel):
    email: str
    password: str


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TaskTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    label: str
    icon: str
    color: str
    built_in: bool
    enabled: bool
    editor: str
    show_status: bool
    show_assignee: bool
    show_due_date: bool


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    type_id: str
    title: str
    body: str
    status: str
    priority: str
    due_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    workspace_id: str
    type_id: str
    title: str = Field(min_length=1, max_length=300)
    body: str = ""
    status: str = "todo"
    priority: str = "none"


class TaskUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    status: str | None = None
    priority: str | None = None
    type_id: str | None = None
    due_at: datetime | None = None


class EdgeOut(BaseModel):
    id: str
    workspace_id: str
    source_id: str
    target_id: str
    kind: str
    type: str


class EdgeCreate(BaseModel):
    workspace_id: str
    source_id: str
    target_id: str
    kind: str = "primary"
    type: str = "next"


class EdgeUpdate(BaseModel):
    kind: str


class PreviewOut(BaseModel):
    task: TaskOut
    type: TaskTypeOut
    edges: list[EdgeOut]
    neighbors: list[TaskOut]


class FocusOut(BaseModel):
    center_id: str
    tasks: list[TaskOut]
    edges: list[EdgeOut]
    types: list[TaskTypeOut]


class BoardOut(BaseModel):
    workspace: WorkspaceOut
    tasks: list[TaskOut]
    types: list[TaskTypeOut]
    edges: list[EdgeOut] = Field(default_factory=list)


class ViewStateOut(BaseModel):
    positions: dict[str, dict[str, float]] = Field(default_factory=dict)
    pinned_ids: list[str] = Field(default_factory=list)


class ViewStateIn(BaseModel):
    positions: dict[str, dict[str, float]]
    pinned_ids: list[str] = Field(default_factory=list)
