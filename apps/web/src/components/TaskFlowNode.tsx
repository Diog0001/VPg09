import { Handle, Position, type NodeProps } from "@xyflow/react";

export type TaskNodeData = {
  title: string;
  typeLabel: string;
  color: string;
  center?: boolean;
  detached?: boolean;
};

export function TaskFlowNode({ data }: NodeProps) {
  const node = data as TaskNodeData;
  const fill = `color-mix(in srgb, ${node.color} 38%, white)`;
  return (
    <div
      className={`vyaz-node${node.center ? " vyaz-node--center" : ""}${node.detached ? " vyaz-node--detached" : ""}`}
      style={{ background: node.detached ? undefined : fill }}
      role="button"
      tabIndex={0}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} id="top" />
      <span className="vyaz-node__type" style={{ color: node.color }}>
        {node.typeLabel}
      </span>
      <strong>{node.title}</strong>
      {node.detached ? <span className="vyaz-node__status">Без связи</span> : null}
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
