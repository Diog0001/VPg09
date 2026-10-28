import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";

const elk = new ELK();

export async function layoutGraph(nodes: Node[], edges: Edge[], centerId: string): Promise<Node[]> {
  if (nodes.length === 0) {
    return nodes;
  }
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "radial",
      "elk.radial.center": centerId,
      "elk.spacing.nodeNode": "80",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.id === centerId ? 240 : 200,
      height: node.id === centerId ? 96 : 80,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
  try {
    const layout = await elk.layout(graph);
    const byId = new Map((layout.children ?? []).map((child) => [child.id, child]));
    return nodes.map((node) => {
      const placed = byId.get(node.id);
      return {
        ...node,
        position: {
          x: placed?.x ?? node.position.x,
          y: placed?.y ?? node.position.y,
        },
      };
    });
  } catch {
    return fallbackCircle(nodes, centerId);
  }
}

function fallbackCircle(nodes: Node[], centerId: string): Node[] {
  const others = nodes.filter((node) => node.id !== centerId);
  const radius = 220;
  return nodes.map((node) => {
    if (node.id === centerId) {
      return { ...node, position: { x: 400, y: 300 } };
    }
    const index = others.findIndex((item) => item.id === node.id);
    const angle = (2 * Math.PI * index) / Math.max(others.length, 1);
    return {
      ...node,
      position: {
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
      },
    };
  });
}
