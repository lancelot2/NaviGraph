import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"
import Ajv from "ajv/dist/2020"
import addFormats from "ajv-formats"
import { buildBundle } from "@/lib/bundle/build"
import { BUNDLE_SCHEMA_VERSION } from "@/lib/bundle/types"
import { EMBEDDING_DIM } from "@/lib/graph/types"
import type { SpatialGraph } from "@/lib/graph/types"
import type { ReferenceEmbedding } from "@/lib/bundle/types"

const schema = JSON.parse(
  readFileSync(resolve("docs/spatial-graph-format.schema.json"), "utf8"),
)
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

const graph: SpatialGraph = {
  nodes: [
    {
      id: "a",
      type: "entrance",
      name: "Main Entrance",
      description: null,
      floor: 0,
      pos_x: 40,
      pos_y: 240,
      metadata: {},
    },
    {
      id: "b",
      type: "room",
      name: "Supply Room",
      description: "Where supplies live.",
      floor: 0,
      pos_x: 240,
      pos_y: 240,
      metadata: { landmarks: ["Metal shelves"], synonyms: ["stockroom"] },
    },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", type: "connected_to", certain: true },
  ],
}

const references: ReferenceEmbedding[] = [
  { id: "p1", node_id: "b", embedding: new Array(EMBEDDING_DIM).fill(0.01) },
]

describe("buildBundle", () => {
  it("produces a schema-valid bundle with embeddings", () => {
    const bundle = buildBundle({
      project: { id: "demo", name: "Demo Building" },
      graph,
      references,
      embedding: { model: "mock", dim: EMBEDDING_DIM, modality: "text", metric: "cosine" },
      generator: "test@1",
      generatedAt: "2026-09-09T12:00:00.000Z",
    })

    expect(bundle.schema_version).toBe(BUNDLE_SCHEMA_VERSION)
    expect(bundle.references).toHaveLength(1)
    const ok = validate(bundle)
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it("drops references when there is no embedding space (zero-vision bundle)", () => {
    const bundle = buildBundle({
      project: { id: "demo", name: "Demo Building" },
      graph,
      references, // provided, but must be discarded without an embedding space
      embedding: null,
      generator: "test@1",
      generatedAt: "2026-09-09T12:00:00.000Z",
    })

    expect(bundle.embedding).toBeNull()
    expect(bundle.references).toHaveLength(0)
    expect(validate(bundle)).toBe(true)
  })

  it("includes an optional georeference when supplied", () => {
    const bundle = buildBundle({
      project: { id: "demo", name: "Demo Building" },
      graph,
      references,
      embedding: { model: "mock", dim: EMBEDDING_DIM, modality: "text", metric: "cosine" },
      georeference: {
        frame_id: "map",
        resolution: 0.05,
        image_width: 1024,
        image_height: 768,
        origin: { x: 0, y: 0, theta: 0 },
      },
      generator: "test@1",
      generatedAt: "2026-09-09T12:00:00.000Z",
    })

    expect(bundle.georeference?.frame_id).toBe("map")
    expect(validate(bundle)).toBe(true)
  })
})
