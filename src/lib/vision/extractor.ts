import { MockVisionProvider } from "./mock"
import { OpenAIVisionProvider } from "./openai"
import type {
  FloorPlanInput,
  ParsedEdge,
  ParsedGraph,
  ParsedNode,
  PhotoAnalysis,
  VisionProvider,
} from "./types"
import type { NodeType, Point, EdgeMetadata } from "@/lib/graph/types"

// Canvas coordinates the editor lays the graph out on (see React Flow usage).
const CANVAS_W = 800
const CANVAS_H = 600

type ExtractedNodeJSON = {
  id: string
  kind: "space" | "passage"
  type: string
  label: string | null
  confidence: number
  polygon: number[][] // normalized [0,1]
  centroid: number[] // normalized [0,1]
}
type ExtractedEdgeJSON = {
  source: string
  target: string
  certain: boolean
  weight: number
  profiles: string[]
}
type ExtractedGraphJSON = {
  nodes: ExtractedNodeJSON[]
  edges: ExtractedEdgeJSON[]
  width: number
  height: number
}

// Vision backend that offloads geometry to the deterministic Python /extractor
// service and maps its bipartite graph onto NaviGraph's ParsedGraph. Only
// parseFloorPlan is specialized; photo analysis and embeddings delegate to the
// configured LLM provider (OpenAI when a key is present, else the mock).
export class ExtractorVisionProvider implements VisionProvider {
  private delegate: VisionProvider =
    process.env.OPENAI_API_KEY
      ? new OpenAIVisionProvider()
      : new MockVisionProvider()

  async parseFloorPlan(input: FloorPlanInput): Promise<ParsedGraph> {
    const base = process.env.EXTRACTOR_URL
    if (!base) throw new Error("EXTRACTOR_URL is not set")
    if (!input.data) throw new Error("ExtractorVisionProvider requires image bytes")

    const form = new FormData()
    // Copy into a clean ArrayBuffer so the type is an unambiguous BlobPart.
    const ab = input.data.buffer.slice(
      input.data.byteOffset,
      input.data.byteOffset + input.data.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([ab], { type: input.mimeType ?? "image/png" })
    form.append("file", blob, "plan.png")

    const res = await fetch(`${base.replace(/\/$/, "")}/extract`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      throw new Error(`Extractor error ${res.status}: ${await res.text()}`)
    }
    const graph = (await res.json()) as ExtractedGraphJSON

    const nodes: ParsedNode[] = graph.nodes.map((n) => ({
      tempId: n.id,
      type: n.type as NodeType,
      name: n.label,
      description: null,
      floor: 0, // single-plan extraction; multi-floor stitching is out of scope
      pos_x: Math.round(n.centroid[0] * CANVAS_W),
      pos_y: Math.round(n.centroid[1] * CANVAS_H),
      points: n.polygon.map(([x, y]) => ({ x, y })) as Point[],
    }))

    const edges: ParsedEdge[] = graph.edges.map((e) => ({
      sourceTempId: e.source,
      targetTempId: e.target,
      type: "connected_to",
      certain: e.certain,
      metadata: {
        weight: e.weight,
        profiles: e.profiles as EdgeMetadata["profiles"],
      },
    }))

    return { nodes, edges }
  }

  analyzePhoto(input: FloorPlanInput): Promise<PhotoAnalysis> {
    return this.delegate.analyzePhoto(input)
  }

  embed(text: string): Promise<number[]> {
    return this.delegate.embed(text)
  }
}
