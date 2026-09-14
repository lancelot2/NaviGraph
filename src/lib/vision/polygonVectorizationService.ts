import type { FloorPlanInput, ParsedGraph, ParsedNode } from "./types"
import type { Point } from "@/lib/graph/types"

// Canvas the VLM lays node anchors out on (pos_x/pos_y). Étape 1 sets these to
// the room's image-space centroid × these dimensions, so dividing back yields a
// normalized [0,1] anchor point usable against the extractor's polygons.
const CANVAS_W = 800
const CANVAS_H = 600

// A room polygon detected by the deterministic OpenCV extractor (Étape 2).
export type ExtractedSpace = {
  id: string
  polygon: Point[] // normalized [0,1]
}

// Raw JSON shape returned by the Python /extractor service (see
// navigraph_extractor.pipeline.graph_to_dict).
type ExtractedNodeJSON = {
  id: string
  kind: "space" | "passage"
  polygon: number[][]
}
type ExtractedGraphJSON = {
  nodes: ExtractedNodeJSON[]
  width: number
  height: number
}

// Max normalized distance between a node anchor and a polygon centroid for the
// nearest-centroid fallback to accept a match (when no polygon contains it).
const CENTROID_FALLBACK_DIST = 0.15

// Ray-casting point-in-polygon on normalized coordinates.
function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersects =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

// Absolute polygon area via the shoelace formula (normalized units).
function polygonArea(poly: Point[]): number {
  let area2 = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    area2 += p.x * q.y - q.x * p.y
  }
  return Math.abs(area2) / 2
}

function centroid(poly: Point[]): Point {
  const x = poly.reduce((s, p) => s + p.x, 0) / poly.length
  const y = poly.reduce((s, p) => s + p.y, 0) / poly.length
  return { x, y }
}

// Pure fusion step (unit-tested): associate each Étape-1 node to the OpenCV
// polygon that best fits its anchor, and replace the node's outline with that
// precise polygon. A node keeps its original VLM geometry when nothing matches;
// each polygon is claimed by at most one node.
export function associatePolygons(
  graph: ParsedGraph,
  spaces: ExtractedSpace[],
): ParsedGraph {
  const usable = spaces.filter((s) => s.polygon.length >= 3)
  const centroids = new Map(usable.map((s) => [s.id, centroid(s.polygon)]))
  const claimed = new Set<string>()

  const nodes: ParsedNode[] = graph.nodes.map((node) => {
    const anchor: Point = {
      x: node.pos_x / CANVAS_W,
      y: node.pos_y / CANVAS_H,
    }

    // Prefer the smallest polygon that contains the anchor (most specific room).
    let best: ExtractedSpace | null = null
    let bestArea = Infinity
    for (const space of usable) {
      if (claimed.has(space.id)) continue
      if (pointInPolygon(anchor, space.polygon)) {
        const area = polygonArea(space.polygon)
        if (area < bestArea) {
          best = space
          bestArea = area
        }
      }
    }

    // Fallback: nearest polygon centroid within a small radius.
    if (!best) {
      let bestDist = CENTROID_FALLBACK_DIST
      for (const space of usable) {
        if (claimed.has(space.id)) continue
        const c = centroids.get(space.id)!
        const d = Math.hypot(c.x - anchor.x, c.y - anchor.y)
        if (d < bestDist) {
          best = space
          bestDist = d
        }
      }
    }

    if (!best) return node
    claimed.add(best.id)
    return { ...node, points: best.polygon }
  })

  return { nodes, edges: graph.edges }
}

// Étape 2 — geometric vectorization. Calls the deterministic Python /extractor
// service for precise room polygons (OpenCV findContours + approxPolyDP), then
// fuses them onto the Étape-1 graph by anchor association. Best-effort: if the
// service is not configured, has no image bytes, or fails, the input graph is
// returned unchanged so the pipeline never blocks on a geometry failure.
export async function vectorizePolygons(
  input: FloorPlanInput,
  graph: ParsedGraph,
): Promise<ParsedGraph> {
  const base = process.env.EXTRACTOR_URL
  if (!base || !input.data) return graph

  // Bound the call so a slow/cold extractor can never hang the request past the
  // serverless timeout — abort and fall back to the VLM geometry instead.
  const timeoutMs = Number(process.env.EXTRACTOR_TIMEOUT_MS) || 5000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const form = new FormData()
    const ab = input.data.buffer.slice(
      input.data.byteOffset,
      input.data.byteOffset + input.data.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([ab], { type: input.mimeType ?? "image/png" })
    form.append("file", blob, "plan.png")

    const res = await fetch(`${base.replace(/\/$/, "")}/extract`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Extractor error ${res.status}: ${await res.text()}`)
    }

    const extracted = (await res.json()) as ExtractedGraphJSON
    const spaces: ExtractedSpace[] = extracted.nodes
      .filter((n) => n.kind === "space" && n.polygon.length >= 3)
      .map((n) => ({
        id: n.id,
        polygon: n.polygon.map(([x, y]) => ({ x, y })),
      }))

    return associatePolygons(graph, spaces)
  } catch (err) {
    console.error(
      "polygonVectorizationService failed or timed out, keeping VLM geometry:",
      err,
    )
    return graph
  } finally {
    clearTimeout(timer)
  }
}
