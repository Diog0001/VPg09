from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_workspace
from app.models import Edge, Task, TaskType, User, ViewState
from app.schemas import (
    EdgeOut,
    FocusOut,
    PreviewOut,
    TaskCreate,
    TaskOut,
    TaskTypeOut,
    TaskUpdate,
    ViewStateIn,
    ViewStateOut,
)
from app.services import active_task, edge_out, enabled_types, focus_graph, key_dependents, soft_delete_task

router = APIRouter(tags=["tasks"])


@router.post("/tasks", response_model=TaskOut)
def create_task(
    payload: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Task:
    require_workspace(db, user, payload.workspace_id)
    task_type = db.get(TaskType, payload.type_id)
    if not task_type or not task_type.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown task type")
    task = Task(
        workspace_id=payload.workspace_id,
        type_id=payload.type_id,
        title=payload.title,
        body=payload.body,
        status=payload.status,
        priority=payload.priority,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=PreviewOut)
def get_preview(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PreviewOut:
    task = active_task(db, task_id)
    require_workspace(db, user, task.workspace_id)
    edges = (
        db.query(Edge)
        .filter(
            Edge.deleted_at.is_(None),
            (Edge.source_id == task.id) | (Edge.target_id == task.id),
        )
        .all()
    )
    neighbor_ids = {e.target_id if e.source_id == task.id else e.source_id for e in edges}
    neighbors = []
    if neighbor_ids:
        neighbors = (
            db.query(Task).filter(Task.id.in_(neighbor_ids), Task.deleted_at.is_(None)).all()
        )
    return PreviewOut(
        task=TaskOut.model_validate(task),
        type=TaskTypeOut.model_validate(task.type),
        edges=[EdgeOut(**edge_out(e)) for e in edges],
        neighbors=[TaskOut.model_validate(n) for n in neighbors],
    )


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Task:
    task = active_task(db, task_id)
    require_workspace(db, user, task.workspace_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(task, key, value)
    task.updated_by = user.id
    task.version += 1
    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: str,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    task = active_task(db, task_id)
    require_workspace(db, user, task.workspace_id)
    dependents = key_dependents(db, task)
    if dependents and not force:
        titles = ", ".join(item.title for item in dependents)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"От задачи зависят ключевые связи: {titles}",
                "dependents": [{"id": item.id, "title": item.title} for item in dependents],
            },
        )
    soft_delete_task(db, task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tasks/{task_id}/focus", response_model=FocusOut)
def get_focus(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FocusOut:
    center = active_task(db, task_id)
    require_workspace(db, user, center.workspace_id)
    tasks, edges = focus_graph(db, center)
    return FocusOut(
        center_id=center.id,
        tasks=[TaskOut.model_validate(t) for t in tasks],
        edges=[EdgeOut(**edge_out(e)) for e in edges],
        types=[TaskTypeOut.model_validate(t) for t in enabled_types(db, center.workspace_id)],
    )


@router.get("/tasks/{task_id}/view-state", response_model=ViewStateOut)
def get_view_state(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ViewStateOut:
    task = active_task(db, task_id)
    require_workspace(db, user, task.workspace_id)
    state = (
        db.query(ViewState)
        .filter(
            ViewState.focus_task_id == task_id,
            ViewState.user_id == user.id,
            ViewState.workspace_id == task.workspace_id,
        )
        .one_or_none()
    )
    return ViewStateOut(
        positions=state.positions if state else {},
        pinned_ids=list(state.pinned_ids or []) if state else [],
    )


@router.put("/tasks/{task_id}/view-state", response_model=ViewStateOut)
def put_view_state(
    task_id: str,
    payload: ViewStateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ViewStateOut:
    task = active_task(db, task_id)
    require_workspace(db, user, task.workspace_id)
    state = (
        db.query(ViewState)
        .filter(
            ViewState.focus_task_id == task_id,
            ViewState.user_id == user.id,
            ViewState.workspace_id == task.workspace_id,
        )
        .one_or_none()
    )
    if not state:
        state = ViewState(
            workspace_id=task.workspace_id,
            focus_task_id=task_id,
            user_id=user.id,
            positions=payload.positions,
            pinned_ids=payload.pinned_ids,
        )
        db.add(state)
    else:
        state.positions = payload.positions
        state.pinned_ids = payload.pinned_ids
    db.commit()
    return ViewStateOut(positions=state.positions, pinned_ids=list(state.pinned_ids or []))
