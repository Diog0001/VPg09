export type User = {
  id: string;
  email: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
};

export type TaskType = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  color: string;
  built_in: boolean;
  enabled: boolean;
  editor: string;
  show_status: boolean;
  show_assignee: boolean;
  show_due_date: boolean;
};

export type Task = {
  id: string;
  workspace_id: string;
  type_id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Edge = {
  id: string;
  workspace_id: string;
  source_id: string;
  target_id: string;
  kind: string;
  type: string;
};

export type Board = {
  workspace: Workspace;
  tasks: Task[];
  types: TaskType[];
  edges: Edge[];
};

export type Preview = {
  task: Task;
  type: TaskType;
  edges: Edge[];
  neighbors: Task[];
};

export type FocusGraph = {
  center_id: string;
  tasks: Task[];
  edges: Edge[];
  types: TaskType[];
};

export type ViewState = {
  positions: Record<string, { x: number; y: number }>;
  pinned_ids: string[];
};

export const STATUSES = [
  { id: "backlog", label: "Бэклог" },
  { id: "todo", label: "К работе" },
  { id: "in_progress", label: "В работе" },
  { id: "blocked", label: "Блок" },
  { id: "review", label: "Ревью" },
  { id: "done", label: "Готово" },
] as const;

export const PRIORITIES: Record<string, string> = {
  none: "нет",
  low: "низкий",
  medium: "средний",
  high: "высокий",
  critical: "критичный",
};

export const KIND_OPTIONS = [
  { id: "primary", label: "Основная связь" },
  { id: "secondary", label: "Косвенная связь" },
  { id: "key", label: "Ключевая связь" },
] as const;

export const KIND_LABEL: Record<string, string> = {
  primary: "Основная связь",
  secondary: "Косвенная связь",
  key: "Ключевая связь",
};

export function pairKey(sourceId: string, targetId: string) {
  return sourceId < targetId ? `${sourceId}:${targetId}` : `${targetId}:${sourceId}`;
}

export function sameTaskPair(
  left: { source?: string | null; target?: string | null },
  right: { source?: string | null; target?: string | null },
) {
  if (!left.source || !left.target || !right.source || !right.target) {
    return false;
  }
  return pairKey(left.source, left.target) === pairKey(right.source, right.target);
}

export function uniquePairEdges<T extends { source_id: string; target_id: string; kind: string }>(edges: T[]): T[] {
  const rank: Record<string, number> = { key: 0, primary: 1, secondary: 2 };
  const best = new Map<string, T>();
  for (const edge of edges) {
    const key = pairKey(edge.source_id, edge.target_id);
    const previous = best.get(key);
    if (!previous || (rank[edge.kind] ?? 9) < (rank[previous.kind] ?? 9)) {
      best.set(key, edge);
    }
  }
  return [...best.values()];
}

export function chainTaskIds(
  edges: { source_id: string; target_id: string }[],
  focusId?: string | null,
) {
  if (focusId) {
    return reachableFrom(
      focusId,
      edges.map((edge) => ({ source: edge.source_id, target: edge.target_id })),
    );
  }
  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.source_id);
    linked.add(edge.target_id);
  }
  return linked;
}

export function reachableFrom(
  centerId: string,
  edges: { source?: string | null; target?: string | null }[],
) {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
    next.set(edge.target, [...(next.get(edge.target) ?? []), edge.source]);
  }
  const seen = new Set<string>([centerId]);
  const queue = [centerId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const other of next.get(current) ?? []) {
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

export function handlesBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

export function applyEdgeLook(kind: string) {
  if (kind === "key") {
    return {
      style: { stroke: "#ad3642", strokeWidth: 4 },
      label: undefined,
      data: { kind },
      interactionWidth: 28,
    };
  }
  if (kind === "secondary") {
    return {
      style: { stroke: "#848890", strokeWidth: 2, strokeDasharray: "6 4" },
      label: undefined,
      data: { kind },
      interactionWidth: 28,
    };
  }
  return {
    style: { stroke: "#fb605e", strokeWidth: 2 },
    label: undefined,
    data: { kind: "primary" },
    interactionWidth: 28,
  };
}
