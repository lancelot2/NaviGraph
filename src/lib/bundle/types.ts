import type { SpatialGraph } from "@/lib/graph/types"

// The NaviGraph spatial-graph bundle — a single, self-describing, versioned file
// that carries everything needed to run localization → planning → context
// generation for one building with no network access.
//
// This type is the TypeScript projection of the public format specified in
// docs/spatial-graph-format.md and docs/spatial-graph-format.schema.json. The
// spec is the source of truth; keep the three in sync.

// Current bundle schema version (semver). Bump the MINOR for backward-compatible
// additions, the MAJOR for breaking changes. Consumers should reject a MAJOR
// they do not recognise.
export const BUNDLE_SCHEMA_VERSION = "1.0.0"

// Describes the vector space of the reference embeddings so a consumer can
// refuse to query a bundle with an incompatible embedder (a CLIP query vector
// is meaningless against text-embedding vectors, and vice versa).
export type EmbeddingSpace = {
  // Embedding model identifier, e.g. "text-embedding-3-small", "clip-vit-b-32",
  // "dinov2-vits14", or "mock".
  model: string
  // Vector dimensionality; every reference embedding has exactly this length.
  dim: number
  // What was embedded: scene text extracted from a photo, or the image itself.
  modality: "text" | "image"
  // Distance metric the embeddings were indexed with.
  metric: "cosine"
}

// One precomputed reference embedding, resolving to the node it localizes to.
export type ReferenceEmbedding = {
  // Opaque, stable id for this reference (the source photo's id).
  id: string
  // Node id (into graph.nodes) this reference identifies.
  node_id: string
  // Vector of length === embedding.dim.
  embedding: number[]
}

// Optional metric anchoring of the (otherwise purely topological) graph into a
// planar map frame, so consumers can emit real coordinates (e.g. a ROS 2
// nav_msgs/Path). Absent means the graph is topological-only.
export type Georeference = {
  // Target coordinate frame, e.g. "map".
  frame_id: string
  // Meters per plan-image pixel.
  resolution: number
  // Plan-image pixel dimensions the normalized coordinates are relative to.
  image_width: number
  image_height: number
  // Map-frame pose of plan-image pixel (0, 0). theta in radians.
  origin: { x: number; y: number; theta: number }
}

export type SpatialGraphBundle = {
  // Format version (see BUNDLE_SCHEMA_VERSION).
  schema_version: string
  // What produced this bundle, e.g. "navigraph-web@0.1.0".
  generator: string
  // ISO 8601 UTC timestamp.
  generated_at: string
  project: { id: string; name: string }
  // The vector space of `references`; null when the bundle has no embeddings
  // (a zero-vision bundle that still supports planning + context generation).
  embedding: EmbeddingSpace | null
  // The full spatial graph (rooms/nodes + connections/edges), identical in shape
  // to what the context engine consumes.
  graph: SpatialGraph
  // Precomputed reference-photo embeddings for offline localization.
  references: ReferenceEmbedding[]
  // Optional metric anchoring; omit for a topological-only graph.
  georeference?: Georeference
}
