// Shared domain types for the Spatial Graph — the single source of truth of a
// building. The graph is purely TOPOLOGICAL (no metric geometry); `pos_x/pos_y`
// are React Flow canvas coordinates only, and `floor` carries multi-storey info.

export const NODE_TYPES = [
  "room",
  "entrance",
  "stair",
  "elevator",
  "landmark",
  // Passage nodes (bipartite graph from the /extractor pipeline). Passages are
  // first-class nodes sitting between the two spaces they connect.
  "door",
  "entrance_door",
  "window",
  "opening",
] as const
export type NodeType = (typeof NODE_TYPES)[number]

// Space node types represent physical places; passage node types are openings.
export const PASSAGE_NODE_TYPES = [
  "door",
  "entrance_door",
  "window",
  "opening",
] as const
export type PassageNodeType = (typeof PASSAGE_NODE_TYPES)[number]

export const EDGE_TYPES = ["connected_to", "contains", "adjacent_to"] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

// Robot capability profiles that may traverse an edge.
export type RobotProfile = "ground" | "uav"

// Extra edge attributes (stored in edges.metadata jsonb): traversal weight and
// which capability profiles may use the edge.
export type EdgeMetadata = {
  weight?: number
  profiles?: RobotProfile[]
}

// Dimension of image embeddings stored in photos.embedding (see Prompt 5/6).
export const EMBEDDING_DIM = 512

// Normalized [0,1] bounding box of a room on the plan image (stored in metadata).
export type Bounds = { x: number; y: number; w: number; h: number }

// A normalized [0,1] point on the plan image — used for polygon room outlines.
export type Point = { x: number; y: number }

// Content stored in nodes.metadata (jsonb): photo-derived semantics (Prompt 5)
// and the room delimitation on the plan (plan editor). No DB schema change.
// A room is a polygon when `points` (≥3) is set; otherwise the `bounds` rectangle.
export type NodeSemantics = {
  objects?: string[]
  landmarks?: string[]
  signs?: string[]
  synonyms?: string[]
  bounds?: Bounds
  points?: Point[]
}

export type GraphNode = {
  id: string
  type: NodeType
  name: string | null
  description: string | null
  floor: number
  pos_x: number
  pos_y: number
  metadata: NodeSemantics
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  type: EdgeType
  certain: boolean
  metadata?: EdgeMetadata
}

export type SpatialGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
