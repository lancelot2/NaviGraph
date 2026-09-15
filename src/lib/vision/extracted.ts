import { NODE_TYPES } from "@/lib/graph/types"
import type { NodeType, Point, EdgeMetadata } from "@/lib/graph/types"
import type { ParsedEdge, ParsedGraph, ParsedNode } from "./types"

// Canvas the editor lays the graph out on (React Flow coordinates).
const CANVAS_W = 800
const CANVAS_H = 600

// Raw JSON returned by the Python /extractor service (see
// navigraph_extractor.pipeline.graph_to_dict). Shared by the client helper
// (which fetches it) and saveExtractedGraph (which persists it).
export type ExtractedNodeJSON = {
  id: string
  kind: "space" | "passage"
  type: string
  label: string | null
  confidence: number
  polygon: number[][] // normalized [0,1]
  centroid: number[] // normalized [0,1]
  objects?: string[] // per-room objects (video-walkthrough modality)
}
export type ExtractedEdgeJSON = {
  source: string
  target: string
  certain: boolean
  weight: number
  profiles: string[]
}
export type ExtractedGraphJSON = {
  nodes: ExtractedNodeJSON[]
  edges: ExtractedEdgeJSON[]
  width: number
  height: number
}

const NODE_TYPE_SET = new Set<string>(NODE_TYPES)

// The extractor's node types already match NaviGraph's; coerce anything
// unexpected to a safe default so a stray label never breaks the DB insert.
function coerceType(type: string, kind: string): NodeType {
  if (NODE_TYPE_SET.has(type)) return type as NodeType
  return kind === "passage" ? "opening" : "room"
}

// Maps the extractor's bipartite graph onto NaviGraph's ParsedGraph. Defensive:
// the payload arrives from the browser, so every field is validated/coerced.
export function mapExtractedToParsed(graph: ExtractedGraphJSON): ParsedGraph {
  const nodes: ParsedNode[] = (graph.nodes ?? []).map((n) => {
    const pts: Point[] = Array.isArray(n.polygon)
      ? n.polygon
          .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
          .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
      : []
    const cx = Number(n.centroid?.[0] ?? 0)
    const cy = Number(n.centroid?.[1] ?? 0)
    const objects = Array.isArray(n.objects)
      ? n.objects.map((o) => String(o)).filter(Boolean)
      : undefined
    return {
      tempId: String(n.id),
      type: coerceType(n.type, n.kind),
      name: n.label ?? null,
      description: null,
      floor: 0, // single-plan extraction; multi-floor stitching is out of scope
      pos_x: Math.round(cx * CANVAS_W),
      pos_y: Math.round(cy * CANVAS_H),
      points: pts.length >= 3 ? pts : undefined,
      objects: objects && objects.length ? objects : undefined,
    }
  })

  const ids = new Set(nodes.map((n) => n.tempId))
  const edges: ParsedEdge[] = (graph.edges ?? [])
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      sourceTempId: e.source,
      targetTempId: e.target,
      type: "connected_to",
      certain: !!e.certain,
      metadata: {
        weight: e.weight,
        profiles: e.profiles as EdgeMetadata["profiles"],
      },
    }))

  return { nodes, edges }
}
