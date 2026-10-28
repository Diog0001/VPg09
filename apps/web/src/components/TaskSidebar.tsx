import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useLeaveGuard } from "../lib/leaveGuard";
import { usePageTitle } from "../lib/usePageTitle";
import { PRIORITIES, STATUSES, type Edge, type Preview, type Task } from "../lib/types";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { KindSwitch } from "./KindSwitch";
import { TypeBadge } from "./TypeBadge";
import { Button, Field, IconClose, Notice, SelectField, TextAreaField } from "./ui";

const PRIORITY_ITEMS = Object.entries(PRIORITIES).map(([id, label]) => ({ id, label }));
const STATUS_ITEMS = STATUSES.map((item) => ({ id: item.id, label: item.label }));

type TaskSidebarProps = {
  workspaceId: string;
  taskId: string;
  onClose: () => void;
  onTaskChanged?: () => Promise<void> | void;
  onEdgeKindChanged?: (edge: Edge) => void;
  onEdgeDeleted?: (edge: Edge) => void;
  onTaskDeleted?: (taskId: string) => void;
  taskHref?: (id: string) => string;
  showConstructorButton?: boolean;
};

export function TaskSidebar({
  workspaceId,
  taskId,
  onClose,
  onTaskChanged,
  onEdgeKindChanged,
  onEdgeDeleted,
  onTaskDeleted,
  taskHref,
  showConstructorButton = true,
}: TaskSidebarProps) {
  const navigate = useNavigate();
  const { tryLeave } = useLeaveGuard();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState(STATUS_ITEMS[1]);
  const [priority, setPriority] = useState(PRIORITY_ITEMS[0]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  usePageTitle(preview ? `Вязь — ${preview.task.title}` : "Вязь — Превью");

  useEffect(() => {
    setPreview(null);
    setError("");
    setSaved("");
    api
      .preview(taskId)
      .then((data) => {
        const next = data as Preview;
        setPreview(next);
        setTitle(next.task.title);
        setBody(next.task.body);
        setDueAt(next.task.due_at ? next.task.due_at.slice(0, 10) : "");
        setStatus(STATUS_ITEMS.find((item) => item.id === next.task.status) ?? STATUS_ITEMS[1]);
        setPriority(PRIORITY_ITEMS.find((item) => item.id === next.task.priority) ?? PRIORITY_ITEMS[0]);
        requestAnimationFrame(() => headingRef.current?.focus());
      })
      .catch((err) => setError(err.message));
  }, [taskId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved("");
    try {
      await api.updateTask(taskId, {
        title,
        body,
        status: status.id,
        priority: priority.id,
        due_at: dueAt ? `${dueAt}T00:00:00Z` : null,
      });
      setSaved("Изменения сохранены.");
      await onTaskChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить. Попробуйте ещё раз.");
    }
  }

  function neighbor(edge: Preview["edges"][number]): Task | undefined {
    const otherId = edge.source_id === taskId ? edge.target_id : edge.source_id;
    return preview?.neighbors.find((item) => item.id === otherId);
  }

  function hrefFor(id: string) {
    return taskHref ? taskHref(id) : `/w/${workspaceId}/tasks/${id}`;
  }

  async function removeEdge(edge: Edge) {
    setError("");
    try {
      await api.deleteEdge(edge.id);
      setPreview((current) =>
        current ? { ...current, edges: current.edges.filter((item) => item.id !== edge.id) } : current,
      );
      onEdgeDeleted?.(edge);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить связь");
    }
  }

  async function changeKind(edgeId: string, kind: string) {
    setError("");
    try {
      const updated = (await api.updateEdge(edgeId, { kind })) as Edge;
      setPreview((current) =>
        current
          ? {
              ...current,
              edges: current.edges.map((item) => (item.id === updated.id ? { ...item, kind: updated.kind } : item)),
            }
          : current,
      );
      onEdgeKindChanged?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить связь");
    }
  }

  return (
    <aside className="vyaz-sidebar" aria-labelledby="vyaz-preview-title">
      <div className="vyaz-sidebar__bar">
        <button type="button" className="vyaz-icon-btn vyaz-icon-btn--quiet" aria-label="Закрыть" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="vyaz-preview">
        {!preview ? (
          error ? (
            <Notice title="Превью не открылось">{error}</Notice>
          ) : (
            <p className="vyaz-muted">Загружаю задачу…</p>
          )
        ) : (
          <>
            <TypeBadge label={preview.type.label} color={preview.type.color} />
            <h2 id="vyaz-preview-title" ref={headingRef} tabIndex={-1}>
              {preview.task.title}
            </h2>
            {showConstructorButton ? (
              <div className="vyaz-preview__actions">
                <Button
                  onClick={() => tryLeave(() => navigate(`/w/${workspaceId}/tasks/${taskId}/map?preview=${taskId}`))}
                >
                  Открыть конструктор
                </Button>
              </div>
            ) : null}
            <form onSubmit={(event) => void onSave(event)}>
              <Field id="title" label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
              <div className="vyaz-preview__meta">
                <SelectField
                  id="status"
                  label="Статус"
                  items={STATUS_ITEMS}
                  valueId={status.id}
                  onValue={(id) => setStatus(STATUS_ITEMS.find((item) => item.id === id) ?? STATUS_ITEMS[1])}
                />
                <SelectField
                  id="priority"
                  label="Приоритет"
                  items={PRIORITY_ITEMS}
                  valueId={priority.id}
                  onValue={(id) => setPriority(PRIORITY_ITEMS.find((item) => item.id === id) ?? PRIORITY_ITEMS[0])}
                />
                {preview.type.show_due_date ? (
                  <Field id="due" type="date" label="Срок" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                ) : null}
              </div>
              <TextAreaField id="body" label="Описание" value={body} onChange={(event) => setBody(event.target.value)} rows={6} />
              {error ? <Notice title="Не сохранено">{error}</Notice> : null}
              {saved ? (
                <p className="vyaz-status" role="status">
                  {saved}
                </p>
              ) : null}
              <div className="vyaz-preview__actions">
                <Button type="submit" kind="ink">
                  Сохранить
                </Button>
                <Button kind="danger" type="button" onClick={() => setDeleteOpen(true)}>
                  Удалить задачу
                </Button>
              </div>
            </form>
            <section className="vyaz-links">
              <h3>Связи</h3>
              {preview.edges.length === 0 ? (
                <p className="vyaz-muted">Пока нет рёбер. Их создают в конструкторе.</p>
              ) : null}
              <ul>
                {preview.edges.map((edge) => {
                  const related = neighbor(edge);
                  return (
                    <li key={edge.id} className="vyaz-link-row">
                      {related ? (
                        <Link className="vyaz-link-chip" to={hrefFor(related.id)}>
                          <strong>{related.title}</strong>
                        </Link>
                      ) : (
                        <span className="vyaz-muted">{edge.target_id}</span>
                      )}
                      <KindSwitch value={edge.kind} onChange={(kind) => void changeKind(edge.id, kind)} />
                      <Button kind="ghost" size="sm" onClick={() => void removeEdge(edge)}>
                        Удалить связь
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
      <DeleteTaskDialog
        open={deleteOpen}
        task={preview?.task ?? { id: taskId, title: title || "Задача" }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={(id) => {
          if (onTaskDeleted) {
            onTaskDeleted(id);
            return;
          }
          void onTaskChanged?.();
          navigate(`/w/${workspaceId}`);
        }}
      />
    </aside>
  );
}
