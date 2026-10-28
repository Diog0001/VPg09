from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_workspace
from app.models import Edge, Membership, MembershipRole, Task, TaskType, User, Workspace
from app.schemas import BoardOut, EdgeOut, TaskOut, TaskTypeOut, WorkspaceCreate, WorkspaceOut
from app.services import edge_out, enabled_types

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Workspace]:
    return (
        db.query(Workspace)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .filter(Membership.user_id == user.id)
        .all()
    )


@router.post("/workspaces", response_model=WorkspaceOut)
def create_workspace(
    payload: WorkspaceCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Workspace:
    slug_base = payload.name.lower().strip().replace(" ", "-")[:60] or "workspace"
    slug = slug_base
    n = 1
    while db.query(Workspace).filter(Workspace.slug == slug).one_or_none():
        n += 1
        slug = f"{slug_base}-{n}"
    workspace = Workspace(name=payload.name, slug=slug, owner_id=user.id)
    db.add(workspace)
    db.flush()
    db.add(Membership(workspace_id=workspace.id, user_id=user.id, role=MembershipRole.OWNER.value))
    db.commit()
    db.refresh(workspace)
    return workspace


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(
    workspace_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Workspace:
    require_workspace(db, user, workspace_id)
    return db.get(Workspace, workspace_id)


@router.get("/workspaces/{workspace_id}/board", response_model=BoardOut)
def get_board(
    workspace_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> BoardOut:
    require_workspace(db, user, workspace_id)
    workspace = db.get(Workspace, workspace_id)
    tasks = (
        db.query(Task)
        .filter(Task.workspace_id == workspace_id, Task.deleted_at.is_(None))
        .order_by(Task.created_at)
        .all()
    )
    edges = (
        db.query(Edge)
        .filter(Edge.workspace_id == workspace_id, Edge.deleted_at.is_(None))
        .all()
    )
    return BoardOut(
        workspace=WorkspaceOut.model_validate(workspace),
        tasks=[TaskOut.model_validate(t) for t in tasks],
        types=[TaskTypeOut.model_validate(t) for t in enabled_types(db, workspace_id)],
        edges=[EdgeOut(**edge_out(edge)) for edge in edges],
    )


@router.get("/task-types", response_model=list[TaskTypeOut])
def list_task_types(
    workspace_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TaskType]:
    require_workspace(db, user, workspace_id)
    return enabled_types(db, workspace_id)
