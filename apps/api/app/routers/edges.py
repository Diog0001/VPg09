from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_workspace
from app.models import Edge, RelationKind, User
from app.schemas import EdgeCreate, EdgeOut, EdgeUpdate
from app.services import active_task, assert_same_workspace, edge_out, find_pair_edge

KINDS = {item.value for item in RelationKind}

router = APIRouter(tags=["edges"])


@router.post("/edges", response_model=EdgeOut)
def create_edge(
    payload: EdgeCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    require_workspace(db, user, payload.workspace_id)
    if payload.source_id == payload.target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Self-edge is not allowed")
    source = active_task(db, payload.source_id)
    target = active_task(db, payload.target_id)
    assert_same_workspace(source, target)
    if source.workspace_id != payload.workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace mismatch")
    existing = find_pair_edge(db, payload.source_id, payload.target_id)
    if existing:
        return edge_out(existing)
    edge = Edge(
        workspace_id=payload.workspace_id,
        source_id=payload.source_id,
        target_id=payload.target_id,
        kind=payload.kind,
        relation_type=payload.type,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge_out(edge)


@router.patch("/edges/{edge_id}", response_model=EdgeOut)
def update_edge(
    edge_id: str, payload: EdgeUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    if payload.kind not in KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown relation kind")
    edge = db.get(Edge, edge_id)
    if not edge or edge.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    require_workspace(db, user, edge.workspace_id)
    if payload.kind != edge.kind:
        siblings = (
            db.query(Edge)
            .filter(
                Edge.id != edge.id,
                or_(
                    and_(Edge.source_id == edge.source_id, Edge.target_id == edge.target_id),
                    and_(Edge.source_id == edge.target_id, Edge.target_id == edge.source_id),
                ),
            )
            .all()
        )
        for sibling in siblings:
            db.delete(sibling)
        db.flush()
        edge.kind = payload.kind
        db.commit()
        db.refresh(edge)
    return edge_out(edge)


@router.delete("/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_edge(
    edge_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    edge = db.get(Edge, edge_id)
    if not edge or edge.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    require_workspace(db, user, edge.workspace_id)
    from datetime import UTC, datetime

    edge.deleted_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
