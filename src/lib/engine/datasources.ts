import "server-only"
import { createClient } from "@/lib/supabase/server"
import { Graph } from "@/lib/graph/repository"
import type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  NodeSemantics,
  EdgeMetadata,
} from "@/lib/graph/types"
import type { ContextDataSource } from "./context"

// In-app requests: read through the caller's Supabase session (RLS).
export function sessionDataSource(projectId: string): ContextDataSource {
  return {
    loadGraph: () => Graph.load(projectId),
    matchLocation: async (embedding) => {
      const supabase = await createClient()
      const { data } = await supabase.rpc("match_location", {
        p_project_id: projectId,
        p_embedding: JSON.stringify(embedding),
      })
      return data?.[0]?.node_id ?? null
    },
  }
}

type RawNode = {
  id: string
  type: string
  name: string | null
  description: string | null
  floor: number
  pos_x: number
  pos_y: number
  metadata: unknown
}
type RawEdge = {
  id: string
  source: string
  target: string
  type: string
  certain: boolean
  metadata?: unknown
}

// External requests: authenticated by an API key via SECURITY DEFINER functions
// that validate the key and project ownership (no session / service role).
export function apiKeyDataSource(
  projectId: string,
  apiKey: string,
): ContextDataSource {
  return {
    loadGraph: async () => {
      const supabase = await createClient()
      const { data } = await supabase.rpc("api_load_graph", {
        p_api_key: apiKey,
        p_project_id: projectId,
      })
      if (!data) throw new Error("Invalid API key or project")
      const raw = data as unknown as { nodes: RawNode[]; edges: RawEdge[] }
      const nodes: GraphNode[] = (raw.nodes ?? []).map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        name: n.name,
        description: n.description,
        floor: n.floor,
        pos_x: n.pos_x,
        pos_y: n.pos_y,
        metadata: (n.metadata ?? {}) as NodeSemantics,
      }))
      const edges: GraphEdge[] = (raw.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type as EdgeType,
        certain: e.certain,
        metadata: (e.metadata ?? {}) as EdgeMetadata,
      }))
      return { nodes, edges }
    },
    matchLocation: async (embedding) => {
      const supabase = await createClient()
      const { data } = await supabase.rpc("api_match_location", {
        p_api_key: apiKey,
        p_project_id: projectId,
        p_embedding: JSON.stringify(embedding),
      })
      return (data as string | null) ?? null
    },
  }
}
