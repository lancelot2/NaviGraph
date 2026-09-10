import type { SpatialGraph } from "@/lib/graph/types"
import {
  BUNDLE_SCHEMA_VERSION,
  type EmbeddingSpace,
  type Georeference,
  type ReferenceEmbedding,
  type SpatialGraphBundle,
} from "./types"

// Pure assembler for a spatial-graph bundle. No I/O — the caller supplies the
// graph, references, and descriptors already read from wherever they live. This
// keeps the format logic testable and identical regardless of the data source.

export type BuildBundleInput = {
  project: { id: string; name: string }
  graph: SpatialGraph
  references: ReferenceEmbedding[]
  embedding: EmbeddingSpace | null
  georeference?: Georeference
  generator: string
  generatedAt?: string // defaults to now; injectable for deterministic tests
}

export function buildBundle(input: BuildBundleInput): SpatialGraphBundle {
  const references = input.embedding ? input.references : []

  const bundle: SpatialGraphBundle = {
    schema_version: BUNDLE_SCHEMA_VERSION,
    generator: input.generator,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    project: { id: input.project.id, name: input.project.name },
    embedding: input.embedding,
    graph: input.graph,
    references,
  }
  if (input.georeference) bundle.georeference = input.georeference
  return bundle
}
