from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

settings.seed_on_start = False

from app.core.security import create_access_token, hash_password
from app.db import Base, get_db
from app.main import app
from app.models import Edge, Membership, MembershipRole, Task, TaskType, User, Workspace
from app.seed import seed_builtin_types


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    types = seed_builtin_types(session)
    user = User(email="demo@vyaz.local", password_hash=hash_password("demo"))
    session.add(user)
    session.flush()
    workspace = Workspace(name="Вязь", slug="vyaz", owner_id=user.id)
    session.add(workspace)
    session.flush()
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role=MembershipRole.OWNER.value))
    session.add(
        Task(
            workspace_id=workspace.id,
            type_id=types["task"].id,
            title="Ядро графа",
            body="",
            created_by=user.id,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    def override_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_db
    user = db.query(User).one()
    token = create_access_token(user.id)
    with TestClient(app) as test_client:
        test_client.cookies.set("vyaz_token", token)
        yield test_client
    app.dependency_overrides.clear()


def _workspace_and_type(db: Session) -> tuple[str, str]:
    workspace = db.query(Workspace).one()
    task_type = db.query(TaskType).filter(TaskType.slug == "task").one()
    return workspace.id, task_type.id


def test_create_task(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    response = client.post(
        "/api/v1/tasks",
        json={"workspace_id": workspace_id, "type_id": type_id, "title": "Новая задача"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Новая задача"
    assert body["workspace_id"] == workspace_id


def test_create_edge(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    response = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    )
    assert response.status_code == 200
    assert response.json()["source_id"] == a["id"]
    assert response.json()["target_id"] == b["id"]
    assert response.json()["kind"] == "primary"


def test_one_edge_per_task_pair(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    first = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    ).json()
    second = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": b["id"],
            "target_id": a["id"],
            "kind": "key",
            "type": "supports",
        },
    ).json()
    assert second["id"] == first["id"]
    assert second["kind"] == "primary"


def test_update_edge_kind(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    edge = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    ).json()
    response = client.patch(f"/api/v1/edges/{edge['id']}", json={"kind": "key"})
    assert response.status_code == 200
    assert response.json()["kind"] == "key"
    bad = client.patch(f"/api/v1/edges/{edge['id']}", json={"kind": "unknown"})
    assert bad.status_code == 400


def test_self_edge_rejected(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    response = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": task["id"],
            "target_id": task["id"],
            "kind": "primary",
            "type": "next",
        },
    )
    assert response.status_code == 400
    assert "Self-edge" in response.json()["detail"]


def test_update_edge_kind_cycle(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    edge = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    ).json()
    for kind in ("key", "secondary", "primary", "secondary", "key", "primary"):
        response = client.patch(f"/api/v1/edges/{edge['id']}", json={"kind": kind})
        assert response.status_code == 200
        assert response.json()["kind"] == kind


def test_update_edge_kind_over_duplicate_pair(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    leftover = Edge(
        workspace_id=workspace_id,
        source_id=a["id"],
        target_id=b["id"],
        kind="primary",
        relation_type="next",
    )
    visible = Edge(
        workspace_id=workspace_id,
        source_id=a["id"],
        target_id=b["id"],
        kind="key",
        relation_type="next",
    )
    db.add_all([leftover, visible])
    db.commit()
    db.refresh(leftover)
    db.refresh(visible)
    response = client.patch(f"/api/v1/edges/{visible.id}", json={"kind": "primary"})
    assert response.status_code == 200
    assert response.json()["kind"] == "primary"
    assert db.get(Edge, leftover.id) is None
    assert db.get(Edge, visible.id).kind == "primary"


def test_delete_edge_keeps_tasks(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    edge = client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    ).json()
    response = client.delete(f"/api/v1/edges/{edge['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/v1/tasks/{a['id']}").status_code == 200
    assert client.get(f"/api/v1/tasks/{b['id']}").status_code == 200
    focus = client.get(f"/api/v1/tasks/{a['id']}/focus").json()
    assert focus["edges"] == []


def test_delete_task_soft(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "Удалить"}
    ).json()
    response = client.delete(f"/api/v1/tasks/{task['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/v1/tasks/{task['id']}").status_code == 404


def test_delete_task_key_needs_force(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "Источник"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "Ключ"}
    ).json()
    client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "key",
            "type": "part_of_key",
        },
    )
    blocked = client.delete(f"/api/v1/tasks/{a['id']}")
    assert blocked.status_code == 409
    assert "Ключ" in blocked.json()["detail"]["message"]
    forced = client.delete(f"/api/v1/tasks/{a['id']}?force=true")
    assert forced.status_code == 204
    assert client.get(f"/api/v1/tasks/{a['id']}").status_code == 404


def test_board_includes_edges(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    a = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "A"}
    ).json()
    b = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "B"}
    ).json()
    client.post(
        "/api/v1/edges",
        json={
            "workspace_id": workspace_id,
            "source_id": a["id"],
            "target_id": b["id"],
            "kind": "primary",
            "type": "next",
        },
    )
    board = client.get(f"/api/v1/workspaces/{workspace_id}/board").json()
    assert {edge["source_id"] for edge in board["edges"]} == {a["id"]}
    assert {edge["target_id"] for edge in board["edges"]} == {b["id"]}


def test_view_state_pins(client: TestClient, db: Session) -> None:
    workspace_id, type_id = _workspace_and_type(db)
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "Центр"}
    ).json()
    extra = client.post(
        "/api/v1/tasks", json={"workspace_id": workspace_id, "type_id": type_id, "title": "С доски"}
    ).json()
    saved = client.put(
        f"/api/v1/tasks/{task['id']}/view-state",
        json={"positions": {extra["id"]: {"x": 10, "y": 20}}, "pinned_ids": [extra["id"]]},
    )
    assert saved.status_code == 200
    assert saved.json()["pinned_ids"] == [extra["id"]]
    loaded = client.get(f"/api/v1/tasks/{task['id']}/view-state").json()
    assert loaded["pinned_ids"] == [extra["id"]]
    assert loaded["positions"][extra["id"]]["x"] == 10
