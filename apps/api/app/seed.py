from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Edge, Membership, MembershipRole, RelationKind, RelationType, Task, TaskStatus, TaskType, User, Workspace

BUILTIN_TYPES = [
    {
        "slug": "task",
        "label": "Задача",
        "icon": "task",
        "color": "#fb605e",
        "editor": "markdown",
        "show_status": True,
        "show_assignee": True,
        "show_due_date": True,
    },
    {
        "slug": "note",
        "label": "Заметка",
        "icon": "notebook",
        "color": "#7dd3c0",
        "editor": "markdown",
        "show_status": False,
        "show_assignee": False,
        "show_due_date": False,
    },
    {
        "slug": "sketch",
        "label": "Скетч",
        "icon": "pen",
        "color": "#f4b183",
        "editor": "canvas",
        "show_status": False,
        "show_assignee": False,
        "show_due_date": False,
    },
    {
        "slug": "design",
        "label": "Дизайн",
        "icon": "color-palette",
        "color": "#c4b5fd",
        "editor": "design",
        "show_status": True,
        "show_assignee": True,
        "show_due_date": True,
    },
]

DEMO_TASKS = [
    ("Ядро графа", "task", TaskStatus.IN_PROGRESS, "Собрать доску, превью и конструктор."),
    ("Доска канбан", "task", TaskStatus.TODO, "Карточки и статусы."),
    ("Исследовать связи", "note", TaskStatus.TODO, "Токены коралла, Inter и Crimson Text."),
    ("Макет превью", "design", TaskStatus.BACKLOG, "Карточка задачи в стиле MindMap24."),
    ("Набросок mindmap", "sketch", TaskStatus.BACKLOG, "Раскладка фокус-графа."),
]


def seed_builtin_types(db: Session) -> dict[str, TaskType]:
    by_slug: dict[str, TaskType] = {}
    for spec in BUILTIN_TYPES:
        existing = (
            db.query(TaskType).filter(TaskType.slug == spec["slug"], TaskType.built_in.is_(True)).one_or_none()
        )
        if existing:
            existing.color = spec["color"]
            by_slug[spec["slug"]] = existing
            continue
        item = TaskType(scope="global", built_in=True, enabled=True, **spec)
        db.add(item)
        db.flush()
        by_slug[spec["slug"]] = item
    return by_slug


def seed_demo(db: Session) -> None:
    types = seed_builtin_types(db)
    user = db.query(User).filter(User.email == "demo@vyaz.local").one_or_none()
    if not user:
        user = User(email="demo@vyaz.local", password_hash=hash_password("demo"))
        db.add(user)
        db.flush()

    workspace = db.query(Workspace).filter(Workspace.slug == "vyaz").one_or_none()
    if not workspace:
        workspace = Workspace(name="Вязь", slug="vyaz", owner_id=user.id)
        db.add(workspace)
        db.flush()
        db.add(Membership(workspace_id=workspace.id, user_id=user.id, role=MembershipRole.OWNER.value))

    note = db.query(Task).filter(Task.workspace_id == workspace.id, Task.title == "Исследовать Carbon").one_or_none()
    if note:
        note.title = "Исследовать связи"
        note.body = "Токены коралла, Inter и Crimson Text."
    design = db.query(Task).filter(Task.workspace_id == workspace.id, Task.title == "Макет превью").one_or_none()
    if design:
        design.body = "Карточка задачи в стиле MindMap24."

    if db.query(Task).filter(Task.workspace_id == workspace.id).count() == 0:
        created: dict[str, Task] = {}
        for title, slug, status, body in DEMO_TASKS:
            item = Task(
                workspace_id=workspace.id,
                type_id=types[slug].id,
                title=title,
                body=body,
                status=status.value,
                created_by=user.id,
                updated_by=user.id,
            )
            db.add(item)
            created[title] = item
        db.flush()
        core = created.get("Ядро графа")
        board = created.get("Доска канбан")
        if core and board:
            db.add(
                Edge(
                    workspace_id=workspace.id,
                    source_id=core.id,
                    target_id=board.id,
                    kind=RelationKind.PRIMARY.value,
                    relation_type=RelationType.NEXT.value,
                )
            )
    db.commit()


def run() -> None:
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()


if __name__ == "__main__":
    run()
