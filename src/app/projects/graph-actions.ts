"use server"

import { Graph } from "@/lib/graph/repository"
import type { NodeType, EdgeType } from "@/lib/graph/types"

// Thin UI-facing wrappers over the internal Graph.update API. Each editor
// interaction persists a single mutation. No revalidatePath: the editor keeps
// the canvas state locally and these just persist it.

export async function moveNode(
  projectId: string,
  nodeId: string,
  pos_x: number,
  pos_y: number,
) {
  await Graph.update(projectId, { kind: "moveNode", nodeId, pos_x, pos_y })
}

export async function renameNode(
  projectId: string,
  nodeId: string,
  name: string,
) {
  await Graph.update(projectId, { kind: "renameNode", nodeId, name })
}

export async function setNodeType(
  projectId: string,
  nodeId: string,
  type: NodeType,
) {
  await Graph.update(projectId, { kind: "setNodeType", nodeId, type })
}

export async function createEdge(
  projectId: string,
  source: string,
  target: string,
  type: EdgeType = "connected_to",
): Promise<string | undefined> {
  const { edgeId } = await Graph.update(projectId, {
    kind: "addEdge",
    source,
    target,
    type,
  })
  return edgeId
}

export async function deleteEdge(projectId: string, edgeId: string) {
  await Graph.update(projectId, { kind: "deleteEdge", edgeId })
}

export async function setEdgeType(
  projectId: string,
  edgeId: string,
  type: EdgeType,
) {
  await Graph.update(projectId, { kind: "setEdgeType", edgeId, type })
}

export async function setEdgeEndpoints(
  projectId: string,
  edgeId: string,
  source: string,
  target: string,
) {
  await Graph.update(projectId, { kind: "setEdgeEndpoints", edgeId, source, target })
}

export async function setNodeDescription(
  projectId: string,
  nodeId: string,
  description: string,
) {
  await Graph.update(projectId, { kind: "setDescription", nodeId, description })
}

export async function confirmEdge(projectId: string, edgeId: string) {
  await Graph.update(projectId, { kind: "setEdgeCertain", edgeId, certain: true })
}

export async function setEdgeCertain(
  projectId: string,
  edgeId: string,
  certain: boolean,
) {
  await Graph.update(projectId, { kind: "setEdgeCertain", edgeId, certain })
}
