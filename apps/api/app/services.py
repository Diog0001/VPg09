from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import Edge, RelationKind, Task, TaskType


def find_pair_edge(db: Session, source_id: str, target_id: str) -> Edge | None:
    return (
        db.query(Edge)
        .filter(
            Edge.deleted_at.is_(None),
            or_(
                and_(Edge.source_id == source_id, Edge.target_id == target_id),
                and_(Edge.source_id == target_id, Edge.target_id == source_id),
            ),
        )
        .first()
    )


def edge_out(edge: Edge) -> dict:
    return {
        "id": edge.id,
        "workspace_id": edge.workspace_id,
        "source_id": edge.source_id,
        "target_id": edge.target_id,
        "kind": edge.kind,
        "type": edge.relation_type,
    }


def active_task(db: Session, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def assert_same_workspace(*tasks: Task) -> None:
    ids = {t.workspace_id for t in tasks}
    if len(ids) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tasks must belong to the same workspace",
        )


def focus_graph(db: Session, center: Task, radius: int = 2) -> tuple[list[Task], list[Edge]]:
    seen = {center.id}
    frontier = {center.id}
    collected: dict[str, Edge] = {}
    for _ in range(radius):
        if not frontier:
            break
        edges = (
            db.query(Edge)
            .filter(
                Edge.deleted_at.is_(None),
                Edge.workspace_id == center.workspace_id,
                or_(Edge.source_id.in_(frontier), Edge.target_id.in_(frontier)),
            )
            .all()
        )
        next_frontier: set[str] = set()
        for edge in edges:
            collected[edge.id] = edge
            other = edge.target_id if edge.source_id in frontier else edge.source_id
            if other not in seen:
                seen.add(other)
                next_frontier.add(other)
        frontier = next_frontier
    tasks = (
        db.query(Task)
        .filter(Task.id.in_(seen), Task.deleted_at.is_(None), Task.workspace_id == center.workspace_id)
        .all()
    )
    return tasks, list(collected.values())


def key_dependents(db: Session, task: Task) -> list[Task]:
    edges = (
        db.query(Edge)
        .filter(
            Edge.deleted_at.is_(None),
            Edge.kind == RelationKind.KEY.value,
            or_(Edge.source_id == task.id, Edge.target_id == task.id),
        )
        .all()
    )
    other_ids = {edge.target_id if edge.source_id == task.id else edge.source_id for edge in edges}
    if not other_ids:
        return []
    return (
        db.query(Task)
        .filter(Task.id.in_(other_ids), Task.deleted_at.is_(None))
        .all()
    )


def soft_delete_task(db: Session, task: Task) -> None:
    now = datetime.now(UTC)
    task.deleted_at = now
    edges = (
        db.query(Edge)
        .filter(
            Edge.deleted_at.is_(None),
            or_(Edge.source_id == task.id, Edge.target_id == task.id),
        )
        .all()
    )
    for edge in edges:
        edge.deleted_at = now


def enabled_types(db: Session, workspace_id: str) -> list[TaskType]:
    return (
        db.query(TaskType)
        .filter(
            TaskType.enabled.is_(True),
            or_(TaskType.workspace_id.is_(None), TaskType.workspace_id == workspace_id),
        )
        .order_by(TaskType.slug)
        .all()
    )
