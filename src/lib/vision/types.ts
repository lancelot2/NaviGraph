import type {
  NodeType,
  EdgeType,
  Bounds,
  Point,
  EdgeMetadata,
} from "@/lib/graph/types"

// The raw graph a VisionProvider extracts from a floor plan, before it is
// persisted. Nodes reference each other by a provider-local `tempId`.
export type ParsedNode = {
  tempId: string
  type: NodeType
  name: string | null
  description: string | null
  floor: number
  pos_x: number
  pos_y: number
  // Normalized [0,1] bounding box of the room on the plan image, when available.
  bounds?: Bounds
  // Normalized [0,1] polygon outline; supersedes `bounds` when present.
  points?: Point[]
}

export type ParsedEdge = {
  sourceTempId: string
  targetTempId: string
  type: EdgeType
  certain: boolean
  metadata?: EdgeMetadata
}

export type ParsedGraph = {
  nodes: ParsedNode[]
  edges: ParsedEdge[]
}

export type FloorPlanInput = {
  // Raw image bytes, or null when the provider does not need them
  // (e.g. the mock provider). Also used as the input for analyzePhoto.
  data: Uint8Array | null
  mimeType: string | null
}

// Semantic content the VisionProvider extracts from a room photo (Prompt 5).
export type PhotoAnalysis = {
  objects: string[]
  landmarks: string[]
  signs: string[]
  synonyms: string[]
}

// Abstraction over any vision backend.
// - parseFloorPlan (Prompt 1): plan image -> topological graph
// - analyzePhoto (Prompt 5): room photo -> semantic content
// - embed (Prompt 5): scene text -> vector for localization (Prompt 6)
export interface VisionProvider {
  parseFloorPlan(input: FloorPlanInput): Promise<ParsedGraph>
  analyzePhoto(input: FloorPlanInput): Promise<PhotoAnalysis>
  embed(text: string): Promise<number[]>
}
