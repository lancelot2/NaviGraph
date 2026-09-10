import "server-only"
import { createClient } from "@/lib/supabase/server"
import type {
  SpatialGraph,
  NodeType,
  EdgeType,
  GraphNode,
  GraphEdge,
  NodeSemantics,
  EdgeMetadata,
} from "./types"
import { findNode, findPath } from "./algo"

// A single, discriminated update entry point for the Spatial Graph. UI actions
// map to one of these; the context engine (Prompt 6) reuses load/findPath.
export type GraphMutation =
  | { kind: "moveNode"; nodeId: string; pos_x: number; pos_y: number }
  | { kind: "renameNode"; nodeId: string; name: string }
  | { kind: "setNodeType"; nodeId: string; type: NodeType }
  | { kind: "setDescription"; nodeId: string; description: string }
  | { kind: "addEdge"; source: string; target: string; type: EdgeType }
  | { kind: "setEdgeCertain"; edgeId: string; certain: boolean }
  | { kind: "deleteEdge"; edgeId: string }

export type GraphUpdateResult = { edgeId?: string }

async function load(projectId: string): Promise<SpatialGraph> {
  const supabase = await createClient()
  const [{ data: nodeRows }, { data: edgeRows }] = await Promise.all([
    supabase
      .from("nodes")
      .select("id, type, name, description, floor, pos_x, pos_y, metadata")
      .eq("project_id", projectId),
    supabase
      .from("edges")
      .select("id, source, target, type, certain, metadata")
      .eq("project_id", projectId),
  ])

  const nodes: GraphNode[] = (nodeRows ?? []).map((n) => ({
    ...n,
    type: n.type as NodeType,
    metadata: (n.metadata ?? {}) as NodeSemantics,
  }))
  const edges: GraphEdge[] = (edgeRows ?? []).map((e) => ({
    ...e,
    type: e.type as EdgeType,
    metadata: (e.metadata ?? {}) as EdgeMetadata,
  }))
  return { nodes, edges }
}

// Bulk replace of a project's graph (edges first for FK safety).
async function save(projectId: string, graph: SpatialGraph): Promise<void> {
  const supabase = await createClient()
  await supabase.from("edges").delete().eq("project_id", projectId)
  await supabase.from("nodes").delete().eq("project_id", projectId)

  if (graph.nodes.length) {
    await supabase.from("nodes").insert(
      graph.nodes.map((n) => ({ ...n, project_id: projectId })),
    )
  }
  if (graph.edges.length) {
    await supabase.from("edges").insert(
      graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        certain: e.certain,
        metadata: e.metadata ?? {},
        project_id: projectId,
      })),
    )
  }
}

async function update(
  projectId: string,
  mutation: GraphMutation,
): Promise<GraphUpdateResult> {
  const supabase = await createClient()

  switch (mutation.kind) {
    case "moveNode":
      await supabase
        .from("nodes")
        .update({ pos_x: mutation.pos_x, pos_y: mutation.pos_y })
        .eq("id", mutation.nodeId)
        .eq("project_id", projectId)
      return {}

    case "renameNode":
      await supabase
        .from("nodes")
        .update({ name: mutation.name })
        .eq("id", mutation.nodeId)
        .eq("project_id", projectId)
      return {}

    case "setNodeType":
      await supabase
        .from("nodes")
        .update({ type: mutation.type })
        .eq("id", mutation.nodeId)
        .eq("project_id", projectId)
      return {}

    case "setDescription":
      await supabase
        .from("nodes")
        .update({ description: mutation.description })
        .eq("id", mutation.nodeId)
        .eq("project_id", projectId)
      return {}

    case "setEdgeCertain":
      await supabase
        .from("edges")
        .update({ certain: mutation.certain })
        .eq("id", mutation.edgeId)
        .eq("project_id", projectId)
      return {}

    case "addEdge": {
      const { data } = await supabase
        .from("edges")
        .insert({
          project_id: projectId,
          source: mutation.source,
          target: mutation.target,
          type: mutation.type,
          certain: true,
        })
        .select("id")
        .single()
      return { edgeId: data?.id }
    }

    case "deleteEdge":
      await supabase
        .from("edges")
        .delete()
        .eq("id", mutation.edgeId)
        .eq("project_id", projectId)
      return {}
  }
}

// Internal Graph API — the single source of truth accessor for a building.
export const Graph = { load, save, update, findNode, findPath }
