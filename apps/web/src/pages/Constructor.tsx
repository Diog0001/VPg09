import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  type OnConnectEnd,
  type OnConnectStart,
} from "@xyflow/react";
import { Button, Dialog, Field, Notice, SelectField } from "../components/ui";
import { usePageTitle } from "../lib/usePageTitle";
import "@xyflow/react/dist/style.css";
import { api } from "../lib/api";
import { useLeaveGuard } from "../lib/leaveGuard";
import { layoutGraph } from "../lib/layout";
import {
  KIND_OPTIONS,
  applyEdgeLook,
  handlesBetween,
  reachableFrom,
  sameTaskPair,
  uniquePairEdges,
  type Board,
  type Edge,
  type FocusGraph,
  type Task,
  type TaskType,
  type ViewState,
} from "../lib/types";
import { DeleteTaskDialog } from "../components/DeleteTaskDialog";
import { KindSwitch } from "../components/KindSwitch";
import { TaskFlowNode, type TaskNodeData } from "../components/TaskFlowNode";
import { TaskSidebar } from "../components/TaskSidebar";

const nodeTypes = { task: TaskFlowNode };

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function withDetached(current: Node[], flowEdges: FlowEdge[], centerId: string): Node[] {
  const reached = reachableFrom(centerId, flowEdges);
  return current.map((node) => ({
    ...node,
    data: {
      ...(node.data as TaskNodeData),
      detached: node.id !== centerId && !reached.has(node.id),
    },
  }));
}

function positionsOf(current: Node[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of current) {
    positions[node.id] = node.position;
  }
  return positions;
}

function isMapChrome(el: Element | null) {
  return Boolean(
    el?.closest(".vyaz-sidebar") ||
      el?.closest(".react-flow__controls") ||
      el?.closest(".react-flow__minimap") ||
      el?.closest(".vyaz-map__bar") ||
      el?.closest(".vyaz-map__tools"),
  );
}

function oppositeHandle(fromPosition?: string) {
  if (fromPosition === "bottom") {
    return "top";
  }
  if (fromPosition === "right") {
    return "left";
  }
  if (fromPosition === "top") {
    return "bottom";
  }
  return "left";
}

function originForHandle(handleId?: string | null): [number, number] {
  if (handleId === "top") {
    return [0.5, 1];
  }
  if (handleId === "left") {
    return [1, 0.5];
  }
  if (handleId === "right") {
    return [0, 0.5];
  }
  return [0.5, 0];
}

function taskNode(task: Task, type: TaskType | undefined, position: { x: number; y: number }, center: boolean): Node {
  return {
    id: task.id,
    type: "task",
    position,
    data: {
      title: task.title,
      typeLabel: type?.label ?? "Задача",
      color: type?.color ?? "#fb605e",
      center,
      detached: false,
    } satisfies TaskNodeData,
  };
}

export function ConstructorPage() {
  return (
    <ReactFlowProvider>
      <ConstructorCanvas />
    </ReactFlowProvider>
  );
}

function ConstructorCanvas() {
  const { workspaceId = "", taskId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewId = searchParams.get("preview");
  const navigate = useNavigate();
  const { tryLeave, setGuard } = useLeaveGuard();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const connectingFrom = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<FlowEdge[]>([]);
  const didFit = useRef(false);
  const selectedEdgeIdRef = useRef<string | null>(null);
  const pinnedIdsRef = useRef<string[]>([]);
  const leaveAction = useRef<(() => void) | null>(null);
  const [graph, setGraph] = useState<FocusGraph | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [open, setOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<TaskType | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [boardChoices, setBoardChoices] = useState<Task[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [deleteTask, setDeleteTask] = useState<{ id: string; title: string } | null>(null);
  selectedEdgeIdRef.current = selectedEdgeId;
  pinnedIdsRef.current = pinnedIds;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  usePageTitle("Вязь — Конструктор");

  const looseTasks = useMemo(
    () =>
      nodes
        .filter((node) => node.id !== taskId && Boolean((node.data as TaskNodeData).detached))
        .map((node) => ({
          id: node.id,
          title: (node.data as TaskNodeData).title,
        })),
    [nodes, taskId],
  );
  const looseRef = useRef(looseTasks);
  looseRef.current = looseTasks;

  const openPreview = useCallback(
    (id: string) => {
      setSearchParams({ preview: id }, { replace: true });
    },
    [setSearchParams],
  );

  const closePreview = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const persistView = useCallback(
    async (current: Node[], pins = pinnedIdsRef.current) => {
      await api.saveViewState(taskId, { positions: positionsOf(current), pinned_ids: pins });
    },
    [taskId],
  );

  const load = useCallback(async () => {
    const data = (await api.focus(taskId)) as FocusGraph;
    const saved = (await api.viewState(taskId)) as ViewState;
    const board = (await api.board(workspaceId)) as Board;
    setGraph(data);
    const typeMap = new Map(data.types.map((item) => [item.id, item]));
    const pins = (saved.pinned_ids ?? []).filter((id) => id !== data.center_id);
    const known = new Set(data.tasks.map((task) => task.id));
    const extra = board.tasks.filter(
      (task) =>
        !known.has(task.id) && (pins.includes(task.id) || Boolean(saved.positions[task.id])),
    );
    const nextNodes: Node[] = [...data.tasks, ...extra].map((task) =>
      taskNode(task, typeMap.get(task.type_id) ?? board.types.find((item) => item.id === task.type_id), saved.positions[task.id] ?? { x: 0, y: 0 }, task.id === data.center_id),
    );
    const nodeIds = new Set(nextNodes.map((node) => node.id));
    const placed = new Map(nextNodes.map((node) => [node.id, node.position]));
    const nextEdges: FlowEdge[] = uniquePairEdges([
      ...data.edges,
      ...(board.edges ?? []).filter((edge) => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)),
    ]).map((edge) => {
      const from = placed.get(edge.source_id);
      const to = placed.get(edge.target_id);
      return {
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        ...(from && to ? handlesBetween(from, to) : {}),
        ...applyEdgeLook(edge.kind),
      };
    });
    const marked = withDetached(nextNodes, nextEdges, data.center_id);
    const missing = marked.filter((node) => !saved.positions[node.id]);
    const laidOut = missing.length === 0 ? marked : await layoutGraph(marked, nextEdges, data.center_id);
    const merged =
      missing.length === 0
        ? laidOut
        : laidOut.map((node) =>
            saved.positions[node.id] ? { ...node, position: saved.positions[node.id] } : node,
          );
    const nextPins = uniqueIds([
      ...pins,
      ...merged.filter((node) => (node.data as TaskNodeData).detached).map((node) => node.id),
    ]);
    const placedAfter = new Map(merged.map((node) => [node.id, node.position]));
    const routedEdges = nextEdges.map((edge) => {
      const from = placedAfter.get(edge.source);
      const to = placedAfter.get(edge.target);
      return from && to ? { ...edge, ...handlesBetween(from, to) } : edge;
    });
    setPinnedIds(nextPins);
    setNodes(withDetached(merged, routedEdges, data.center_id));
    setEdges(routedEdges);
    setSelectedType(data.types.find((item) => item.slug === "task") ?? data.types[0] ?? null);
    if (missing.length > 0) {
      await persistView(merged, nextPins);
    }
    return merged;
  }, [persistView, setEdges, setNodes, taskId, workspaceId]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (didFit.current || nodes.length === 0) {
      return;
    }
    didFit.current = true;
    requestAnimationFrame(() => {
      void fitView({ padding: 0.2 });
    });
  }, [fitView, nodes.length]);

  useEffect(() => {
    setGuard((proceed) => {
      if (looseRef.current.length === 0) {
        return false;
      }
      leaveAction.current = proceed;
      setLeaveOpen(true);
      return true;
    });
    return () => setGuard(null);
  }, [setGuard]);

  const persistPositions = useCallback(
    async (current: Node[]) => {
      await persistView(current);
    },
    [persistView],
  );

  const selectEdge = useCallback(
    (edgeId: string) => {
      setSelectedEdgeId(edgeId);
      setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edgeId })));
    },
    [setEdges],
  );

  const applyGraph = useCallback(
    (nextNodes: Node[], nextEdges: FlowEdge[], pins?: string[]) => {
      const marked = withDetached(nextNodes, nextEdges, taskId);
      const nextPins = uniqueIds([
        ...(pins ?? pinnedIdsRef.current),
        ...marked.filter((node) => (node.data as TaskNodeData).detached).map((node) => node.id),
      ]);
      setPinnedIds(nextPins);
      setNodes(marked);
      setEdges(nextEdges);
      void persistView(marked, nextPins);
    },
    [persistView, setEdges, setNodes, taskId],
  );

  const connectPair = useCallback(
    async (
      source: string,
      target: string,
      handles?: { sourceHandle?: string | null; targetHandle?: string | null },
    ) => {
      if (!source || !target || source === target) {
        return;
      }
      const currentEdges = edgesRef.current;
      const already = currentEdges.find((edge) => sameTaskPair(edge, { source, target }));
      if (already) {
        selectEdge(already.id);
        return;
      }
      setError("");
      try {
        const created = (await api.createEdge({
          workspace_id: workspaceId,
          source_id: source,
          target_id: target,
          kind: "primary",
          type: "next",
        })) as Edge;
        const latest = edgesRef.current;
        const pair = latest.find((edge) => edge.id === created.id || sameTaskPair(edge, { source, target }));
        const nextEdges: FlowEdge[] = pair
          ? latest.map((item) => ({
              ...item,
              selected: item.id === pair.id,
              ...(item.id === created.id ? applyEdgeLook(created.kind) : {}),
            }))
          : [
              ...latest,
              {
                id: created.id,
                source,
                target,
                sourceHandle: handles?.sourceHandle ?? undefined,
                targetHandle: handles?.targetHandle ?? undefined,
                selected: true,
                ...applyEdgeLook(created.kind),
              },
            ];
        setSelectedEdgeId(created.id);
        applyGraph(nodesRef.current, nextEdges);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось создать связь");
      }
    },
    [applyGraph, selectEdge, workspaceId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      void connectPair(connection.source, connection.target, {
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      });
    },
    [connectPair],
  );

  const createTaskFrom = useCallback(
    async (
      sourceId: string,
      position: { x: number; y: number },
      name?: string,
      handles?: { sourceHandle?: string | null; targetHandle?: string | null },
    ) => {
      const type = selectedType ?? graph?.types.find((item) => item.slug === "task") ?? graph?.types[0] ?? null;
      if (!type || creatingRef.current) {
        return;
      }
      creatingRef.current = true;
      setCreating(true);
      setError("");
      try {
        const task = (await api.createTask({
          workspace_id: workspaceId,
          type_id: type.id,
          title: name?.trim() || "Новая задача",
        })) as Task;
        const kind = type.slug === "task" ? "primary" : "secondary";
        const createdEdge = (await api.createEdge({
          workspace_id: workspaceId,
          source_id: sourceId,
          target_id: task.id,
          kind,
          type: type.slug === "task" ? "next" : "supports",
        })) as Edge;
        const newNode = taskNode(task, type, position, false);
        newNode.origin = originForHandle(handles?.sourceHandle);
        const newEdge: FlowEdge = {
          id: createdEdge.id,
          source: sourceId,
          target: task.id,
          sourceHandle: handles?.sourceHandle ?? undefined,
          targetHandle: handles?.targetHandle ?? undefined,
          ...applyEdgeLook(kind),
        };
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        applyGraph(
          currentNodes.some((node) => node.id === task.id) ? currentNodes : [...currentNodes, newNode],
          currentEdges.some((edge) => edge.id === newEdge.id) ? currentEdges : [...currentEdges, newEdge],
        );
        openPreview(task.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось создать ветку");
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [applyGraph, graph?.types, openPreview, selectedType, workspaceId],
  );

  const onConnectStart = useCallback<OnConnectStart>((_event, params) => {
    connectingFrom.current = params.nodeId ?? null;
  }, []);

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      const sourceId = state.fromNode?.id ?? connectingFrom.current;
      connectingFrom.current = null;
      if (state.isValid || !sourceId || creatingRef.current) {
        return;
      }
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const under = document.elementFromPoint(point.clientX, point.clientY);
      if (isMapChrome(under)) {
        return;
      }
      const overId = under?.closest(".react-flow__node")?.getAttribute("data-id");
      const handles = {
        sourceHandle: state.fromHandle?.id,
        targetHandle: oppositeHandle(state.fromHandle?.position),
      };
      if (overId && overId !== sourceId) {
        void connectPair(sourceId, overId, handles);
        return;
      }
      if (overId === sourceId) {
        return;
      }
      const position = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      void createTaskFrom(sourceId, position, undefined, handles);
    },
    [connectPair, createTaskFrom, screenToFlowPosition],
  );

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    setSelectedEdgeId(null);
    setEdges((current) => current.map((item) => ({ ...item, selected: false })));
    openPreview(node.id);
  };

  const onEdgeClick: EdgeMouseHandler = (_event, edge) => {
    selectEdge(edge.id);
  };

  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const selectedKindId = (selectedEdge?.data as { kind?: string } | undefined)?.kind ?? "primary";
  const selectedTask = nodes.find((node) => node.id === previewId);

  const changeSelectedKind = useCallback(
    async (kind: string) => {
      const edgeId = selectedEdgeIdRef.current;
      if (!edgeId) {
        return;
      }
      setError("");
      try {
        const updated = (await api.updateEdge(edgeId, { kind })) as Edge;
        setEdges((current) =>
          current.map((item) => (item.id === updated.id ? { ...item, ...applyEdgeLook(updated.kind) } : item)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось изменить связь");
      }
    },
    [setEdges],
  );

  const removeSelectedEdge = useCallback(async () => {
    const edgeId = selectedEdgeIdRef.current;
    if (!edgeId) {
      return;
    }
    setError("");
    try {
      await api.deleteEdge(edgeId);
      setSelectedEdgeId(null);
      applyGraph(
        nodes,
        edges.filter((edge) => edge.id !== edgeId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить связь");
    }
  }, [applyGraph, edges, nodes]);

  const handleDeletedEdge = useCallback(
    (edge: Edge) => {
      setSelectedEdgeId((current) => (current === edge.id ? null : current));
      applyGraph(
        nodes,
        edges.filter((item) => item.id !== edge.id),
      );
    },
    [applyGraph, edges, nodes],
  );

  const handleDeletedTask = useCallback(
    (id: string) => {
      if (id === taskId) {
        setGuard(null);
        navigate(`/w/${workspaceId}`);
        return;
      }
      if (previewId === id) {
        closePreview();
      }
      applyGraph(
        nodes.filter((node) => node.id !== id),
        edges.filter((edge) => edge.source !== id && edge.target !== id),
        pinnedIdsRef.current.filter((item) => item !== id),
      );
    },
    [applyGraph, closePreview, edges, navigate, nodes, previewId, setGuard, taskId, workspaceId],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (selectedEdgeIdRef.current) {
        event.preventDefault();
        void removeSelectedEdge();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeSelectedEdge]);

  async function addBranch() {
    if (!title.trim()) {
      return;
    }
    const offset = nodes.length * 48;
    await createTaskFrom(taskId, { x: 240 + offset, y: 120 + offset }, title);
    setOpen(false);
    setTitle("");
  }

  async function openBoardPicker() {
    setError("");
    try {
      const board = (await api.board(workspaceId)) as Board;
      const onCanvas = new Set(nodes.map((node) => node.id));
      setBoardChoices(board.tasks.filter((task) => !onCanvas.has(task.id)));
      setPickedIds([]);
      setBoardOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить доску");
    }
  }

  function addFromBoard() {
    const typeMap = new Map((graph?.types ?? []).map((item) => [item.id, item]));
    const center = nodes.find((node) => node.id === taskId)?.position ?? { x: 0, y: 0 };
    const extras = boardChoices.filter((task) => pickedIds.includes(task.id));
    const added = extras.map((task, index) =>
      taskNode(task, typeMap.get(task.type_id), { x: center.x + 260, y: center.y + index * 96 }, false),
    );
    applyGraph([...nodes, ...added], edges, uniqueIds([...pinnedIds, ...added.map((node) => node.id)]));
    setBoardOpen(false);
    if (added[0]) {
      openPreview(added[0].id);
    }
  }

  async function finishLeave(keep: boolean) {
    const looseIds = new Set(looseRef.current.map((item) => item.id));
    const nextPins = keep
      ? uniqueIds([...pinnedIdsRef.current, ...looseIds])
      : pinnedIdsRef.current.filter((id) => !looseIds.has(id));
    setPinnedIds(nextPins);
    await persistView(nodes, nextPins);
    setLeaveOpen(false);
    const action = leaveAction.current;
    leaveAction.current = null;
    action?.();
  }

  return (
    <div className="vyaz-workspace vyaz-workspace--map">
      <div className="vyaz-map">
        <div className="vyaz-map__bar">
          <Button kind="ghost" size="sm" onClick={() => openPreview(taskId)}>
            К превью
          </Button>
          <Button kind="ghost" size="sm" onClick={() => tryLeave(() => navigate(`/w/${workspaceId}`))}>
            На доску
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            Добавить ветку
          </Button>
          <Button kind="ink" size="sm" onClick={() => void openBoardPicker()}>
            С доски
          </Button>
          {error ? <Notice title="Конструктор">{error}</Notice> : null}
        </div>
        <div className="vyaz-map__canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onClickConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            isValidConnection={(connection) =>
              Boolean(connection.source && connection.target && connection.source !== connection.target)
            }
            connectionMode={ConnectionMode.Loose}
            onPaneClick={(event) => {
              const target = event.target as HTMLElement | undefined;
              if (target?.closest?.(".vyaz-map__tools, .vyaz-kind-switch, [role='listbox']")) {
                return;
              }
              setSelectedEdgeId(null);
              setEdges((current) => current.map((item) => ({ ...item, selected: false })));
            }}
            onNodeDragStop={(_event, _node, current) => void persistPositions(current)}
            nodeTypes={nodeTypes}
            connectOnClick={false}
            connectionRadius={28}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
          <div
            className="vyaz-map__tools"
            role="toolbar"
            aria-label="Инструменты объекта"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ul className="vyaz-edge-legend" aria-label="Виды связей">
              {KIND_OPTIONS.map((item) => (
                <li key={item.id} className={`vyaz-edge-legend__item vyaz-edge-legend__item--${item.id}`}>
                  <span className="vyaz-edge-legend__line" aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            {selectedEdge ? (
              <>
                <KindSwitch value={selectedKindId} onChange={(kind) => void changeSelectedKind(kind)} />
                <Button kind="danger" size="sm" onClick={() => void removeSelectedEdge()}>
                  Удалить связь
                </Button>
              </>
            ) : selectedTask ? (
              <>
                <p className="vyaz-map__tools-label">
                  Задача: {(selectedTask.data as TaskNodeData).title}
                  {(selectedTask.data as TaskNodeData).detached ? " · без связи" : ""}
                </p>
                <Button
                  kind="danger"
                  size="sm"
                  onClick={() =>
                    setDeleteTask({
                      id: selectedTask.id,
                      title: (selectedTask.data as TaskNodeData).title,
                    })
                  }
                >
                  Удалить задачу
                </Button>
              </>
            ) : (
              <p className="vyaz-muted">Выберите связь или задачу</p>
            )}
          </div>
        </div>
        <Dialog
          open={open}
          title="Новая ветка — это задача"
          primaryLabel="Создать"
          primaryDisabled={creating || !title.trim()}
          onClose={() => setOpen(false)}
          onPrimary={() => void addBranch()}
        >
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <Field id="branch-title" label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
            <SelectField
              id="branch-type"
              label="Тип задачи"
              items={(graph?.types ?? []).map((item) => ({ id: item.id, label: item.label }))}
              valueId={selectedType?.id ?? graph?.types[0]?.id ?? ""}
              onValue={(id) => setSelectedType(graph?.types.find((item) => item.id === id) ?? null)}
            />
          </div>
        </Dialog>
        <Dialog
          open={boardOpen}
          title="Добавить задачи с доски"
          primaryLabel="Добавить"
          primaryDisabled={pickedIds.length === 0}
          onClose={() => setBoardOpen(false)}
          onPrimary={addFromBoard}
        >
          {boardChoices.length === 0 ? (
            <p className="vyaz-muted">На доске нет задач, которых ещё нет на холсте.</p>
          ) : (
            <ul className="vyaz-board-pick">
              {boardChoices.map((task) => (
                <li key={task.id}>
                  <label className="vyaz-check">
                    <input
                      type="checkbox"
                      checked={pickedIds.includes(task.id)}
                      onChange={(event) =>
                        setPickedIds((current) =>
                          event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                        )
                      }
                    />
                    {task.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
        <Dialog
          open={leaveOpen}
          title="Задачи без связи"
          primaryLabel="Оставить в конструкторе"
          secondaryLabel="Убрать с холста"
          onClose={() => {
            setLeaveOpen(false);
            leaveAction.current = null;
          }}
          onPrimary={() => void finishLeave(true)}
          onSecondary={() => void finishLeave(false)}
        >
          <p>Эти задачи остались на холсте без ребра. Сохранить их в этом конструкторе?</p>
          <ul>
            {looseTasks.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </Dialog>
        <DeleteTaskDialog
          open={Boolean(deleteTask)}
          task={deleteTask}
          onClose={() => setDeleteTask(null)}
          onDeleted={handleDeletedTask}
        />
      </div>
      {previewId ? (
        <TaskSidebar
          workspaceId={workspaceId}
          taskId={previewId}
          onClose={closePreview}
          onTaskChanged={() => void load()}
          onEdgeKindChanged={(edge) => {
            setEdges((current) =>
              current.map((item) => (item.id === edge.id ? { ...item, ...applyEdgeLook(edge.kind) } : item)),
            );
          }}
          onEdgeDeleted={handleDeletedEdge}
          onTaskDeleted={handleDeletedTask}
          showConstructorButton={previewId !== taskId}
          taskHref={(id) => `/w/${workspaceId}/tasks/${taskId}/map?preview=${id}`}
        />
      ) : null}
    </div>
  );
}
