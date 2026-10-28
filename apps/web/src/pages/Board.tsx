import { DragEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { DeleteTaskDialog } from "../components/DeleteTaskDialog";
import { TypeBadge } from "../components/TypeBadge";
import { Button, Dialog, Field, IconTrash, Notice, SelectField } from "../components/ui";
import { api } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";
import { PRIORITIES, STATUSES, chainTaskIds, type Board, type Task, type TaskType } from "../lib/types";

export function BoardPage() {
  const { workspaceId = "", taskId } = useParams();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dragging = useRef(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<TaskType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  usePageTitle(board ? `Вязь — ${board.workspace.name}` : "Вязь — Доска");

  async function load() {
    const data = (await api.board(workspaceId)) as Board;
    setBoard(data);
    setSelectedType(data.types.find((item) => item.slug === "task") ?? data.types[0] ?? null);
  }

  useEffect(() => {
    load()
      .then(() => {
        if (!taskId) {
          headingRef.current?.focus();
        }
      })
      .catch((err) => setError(err.message));
  }, [workspaceId]);

  const byStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const status of STATUSES) {
      map[status.id] = [];
    }
    for (const task of board?.tasks ?? []) {
      if (map[task.status]) {
        map[task.status].push(task);
      }
    }
    return map;
  }, [board]);

  const chainedIds = useMemo(() => chainTaskIds(board?.edges ?? []), [board?.edges]);
  const focusedChain = useMemo(() => chainTaskIds(board?.edges ?? [], taskId), [board?.edges, taskId]);

  function typeOf(task: Task) {
    return board?.types.find((item) => item.id === task.type_id);
  }

  function onDragStart(event: DragEvent, id: string) {
    dragging.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/task-id", id);
  }

  async function onDrop(event: DragEvent, status: string) {
    event.preventDefault();
    const droppedId = event.dataTransfer.getData("text/task-id");
    dragging.current = false;
    if (!droppedId) {
      return;
    }
    await api.updateTask(droppedId, { status });
    await load();
  }

  async function createTask() {
    if (!selectedType || !title.trim()) {
      return;
    }
    await api.createTask({
      workspace_id: workspaceId,
      type_id: selectedType.id,
      title: title.trim(),
    });
    setOpen(false);
    setTitle("");
    await load();
  }

  if (!board) {
    return (
      <div className="vyaz-board">
        {error ? (
          <Notice title="Доска не загрузилась">{error}</Notice>
        ) : (
          <>
            <div className="vyaz-skeleton" aria-hidden="true">
              <span style={{ width: "28%" }} />
              <span style={{ width: "46%" }} />
            </div>
            <p className="vyaz-muted">Загружаю колонки…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`vyaz-workspace${taskId ? " vyaz-workspace--with-sidebar" : ""}`}>
      <div className="vyaz-board">
        <div className="vyaz-board__toolbar">
          <div>
            <h1 ref={headingRef} tabIndex={-1}>
              {board.workspace.name}
            </h1>
            <p>Карточка открывает превью. Цвет — связанная цепочка.</p>
          </div>
          <Button onClick={() => setOpen(true)}>Новая задача</Button>
        </div>
        {error ? <Notice title="Не удалось обновить доску">{error}</Notice> : null}
        <div className="vyaz-board__columns">
          {STATUSES.map((column) => {
            const tasks = byStatus[column.id] ?? [];
            return (
              <section
                key={column.id}
                className="vyaz-column"
                aria-label={`${column.label}, ${tasks.length}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void onDrop(event, column.id)}
              >
                <h2>
                  {column.label} ({tasks.length})
                </h2>
                {tasks.length === 0 ? <p className="vyaz-column__empty">Нет задач</p> : null}
                {tasks.map((task) => {
                  const type = typeOf(task);
                  const dimmed = Boolean(taskId) && chainedIds.has(task.id) && !focusedChain.has(task.id);
                  return (
                    <article
                      key={task.id}
                      className={`vyaz-card${task.id === taskId ? " vyaz-card--active" : ""}${dimmed ? " vyaz-card--dim" : ""}`}
                      style={{ "--vyaz-type-color": type?.color ?? "#fb605e" } as CSSProperties}
                      draggable
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("button")) {
                          event.preventDefault();
                          return;
                        }
                        onDragStart(event, task.id);
                      }}
                    >
                      <Link
                        className="vyaz-card__open"
                        to={`/w/${workspaceId}/tasks/${task.id}`}
                        aria-current={task.id === taskId ? "page" : undefined}
                        onClick={(event) => {
                          if (dragging.current) {
                            event.preventDefault();
                            dragging.current = false;
                          }
                        }}
                      >
                        <TypeBadge label={type?.label ?? "Задача"} color={type?.color} />
                        <h3>{task.title}</h3>
                        <p>
                          {PRIORITIES[task.priority] ?? task.priority}
                          {task.due_at ? ` · ${task.due_at.slice(0, 10)}` : ""}
                        </p>
                      </Link>
                      <button
                        type="button"
                        className="vyaz-icon-btn vyaz-icon-btn--quiet vyaz-icon-btn--danger vyaz-card__delete"
                        aria-label="Удалить задачу"
                        draggable={false}
                        onClick={() => setDeleteTarget(task)}
                      >
                        <IconTrash />
                      </button>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
        <Dialog
          open={open}
          title="Новая задача"
          primaryLabel="Создать"
          primaryDisabled={!title.trim()}
          onClose={() => setOpen(false)}
          onPrimary={() => void createTask()}
        >
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <Field id="new-title" label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
            <SelectField
              id="new-type"
              label="Тип"
              items={board.types.map((item) => ({ id: item.id, label: item.label }))}
              valueId={selectedType?.id ?? board.types[0]?.id ?? ""}
              onValue={(id) => setSelectedType(board.types.find((item) => item.id === id) ?? null)}
            />
          </div>
        </Dialog>
      </div>
      <Outlet context={{ onTaskChanged: load }} />
      <DeleteTaskDialog
        open={Boolean(deleteTarget)}
        task={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          if (id === taskId) {
            navigate(`/w/${workspaceId}`);
          }
          void load();
        }}
      />
    </div>
  );
}
