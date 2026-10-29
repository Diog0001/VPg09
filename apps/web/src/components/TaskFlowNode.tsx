import { Handle, Position, type NodeProps } from "@xyflow/react";

export type TaskNodeData = {
  title: string;
  typeLabel: string;
  color: string;
  center?: boolean;
  detached?: boolean;
};

function SideHandles({ position, id }: { position: Position; id: string }) {
  return (
    <>
      <Handle type="target" position={position} id={id} />
      <Handle type="source" position={position} id={id} />
    </>
  );
}

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
      <SideHandles position={Position.Left} id="left" />
      <SideHandles position={Position.Top} id="top" />
      <span className="vyaz-node__type" style={{ color: node.color }}>
        {node.typeLabel}
      </span>
      <strong>{node.title}</strong>
      {node.detached ? <span className="vyaz-node__status">Без связи</span> : null}
      <SideHandles position={Position.Right} id="right" />
      <SideHandles position={Position.Bottom} id="bottom" />
    </div>
  );
}
