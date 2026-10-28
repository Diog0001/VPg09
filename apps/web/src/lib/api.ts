const API = "/api/v1";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return "Ошибка запроса";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("unauthorized", 401, "unauthorized");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(detailMessage(data.detail), res.status, data.detail);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  workspaces: () => request("/workspaces"),
  board: (workspaceId: string) => request(`/workspaces/${workspaceId}/board`),
  taskTypes: (workspaceId: string) => request(`/task-types?workspace_id=${workspaceId}`),
  createTask: (payload: object) =>
    request("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  preview: (taskId: string) => request(`/tasks/${taskId}`),
  updateTask: (taskId: string, payload: object) =>
    request(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTask: (taskId: string, force = false) =>
    request<void>(`/tasks/${taskId}${force ? "?force=true" : ""}`, { method: "DELETE" }),
  focus: (taskId: string) => request(`/tasks/${taskId}/focus`),
  viewState: (taskId: string) => request(`/tasks/${taskId}/view-state`),
  saveViewState: (
    taskId: string,
    payload: { positions: Record<string, { x: number; y: number }>; pinned_ids: string[] },
  ) =>
    request(`/tasks/${taskId}/view-state`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  createEdge: (payload: object) =>
    request("/edges", { method: "POST", body: JSON.stringify(payload) }),
  updateEdge: (edgeId: string, payload: object) =>
    request(`/edges/${edgeId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteEdge: (edgeId: string) => request<void>(`/edges/${edgeId}`, { method: "DELETE" }),
};
