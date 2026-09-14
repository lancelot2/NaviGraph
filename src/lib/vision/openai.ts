import { NODE_TYPES, EDGE_TYPES, EMBEDDING_DIM } from "@/lib/graph/types"
import type { Point } from "@/lib/graph/types"
import type {
  FloorPlanInput,
  ParsedEdge,
  ParsedGraph,
  ParsedNode,
  PhotoAnalysis,
  VisionProvider,
} from "./types"

// Real provider using OpenAI vision (Chat Completions). Enabled with
// VISION_PROVIDER=openai and OPENAI_API_KEY. Expect imperfect extraction — the
// editor (Prompt 2) is the correction path. Only raster images are supported;
// PDFs should be rasterised upstream (not done in the MVP), otherwise the caller
// falls back to the mock.
// gpt-4.1 localizes room corners/polygons markedly better than gpt-4o on real
// plans. Override per deployment with OPENAI_VISION_MODEL.
const DEFAULT_MODEL = "gpt-4.1"

const SYSTEM = `You extract a topological spatial graph from a building floor plan image.
Return ONLY a JSON object (no prose) with this exact shape:
{
  "nodes": [{ "tempId": string, "type": one of ${JSON.stringify(NODE_TYPES)},
             "name": string|null, "floor": number,
             "pos_x": number, "pos_y": number,
             "bounds": { "x": number, "y": number, "w": number, "h": number },
             "points": [[x, y], ...] }],
  "edges": [{ "sourceTempId": string, "targetTempId": string,
             "type": one of ${JSON.stringify(EDGE_TYPES)}, "certain": boolean }]
}
Rules: identify EVERY room, plus entrances, staircases ("stair") and elevators
("elevator") visible on the plan, each as its own node — do not miss any. Do NOT
create nodes for doors; instead, wherever two rooms share a doorway, opening or
passage, connect them with a "connected_to" edge.
Trace the WALL lines to determine each room's extent, in NORMALIZED [0,1] coordinates
(x from the left edge, y from the top edge, as fractions of the whole image).
"bounds" is the room's bounding box: x,y = its TOP-LEFT corner, w,h = width/height;
ensure x+w<=1 and y+h<=1 and it hugs the room's outer walls (neither floating inside
nor spilling past them). "points" is the room's boundary polygon: an ordered list of
its corner vertices going around the room, following the ACTUAL shape (often
non-rectangular — L-shapes, alcoves — so use 4+ corners), each vertex on a wall corner.
Both must describe the SAME room; keep them consistent. pos_x/pos_y are layout
coordinates on a ~800x600 canvas.
Use "connected_to" for rooms joined by a doorway/passage, "adjacent_to" when two rooms
share a wall but you are unsure they connect, and "contains" for a room enclosing a
landmark. Mark certain=false for connections you are not confident about.`

const ANALYZE_SYSTEM = `You analyse a single photo taken inside a room of a building.
Return ONLY a JSON object (no prose) with this exact shape:
{
  "objects": string[],   // notable objects visible (e.g. "desk", "fire extinguisher")
  "landmarks": string[], // distinctive, memorable features useful to recognise this room
  "signs": string[],     // text on any visible signs/labels/doors
  "synonyms": string[]   // alternative names a person might call this room
}
Keep each list concise (max ~6 items). Use [] when nothing applies.`

// Reject degenerate room polygons (GPT occasionally returns a line spanning the
// image). A sane room has meaningful area and a non-extreme aspect ratio.
function polygonOk(points: Point[]): boolean {
  if (points.length < 3) return false
  let area2 = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    area2 += p.x * q.y - q.x * p.y
  }
  if (Math.abs(area2) / 2 < 0.0008) return false // < ~0.08% of the image
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  if (w <= 0 || h <= 0) return false
  if (Math.max(w / h, h / w) > 12) return false // line-like
  return true
}

export class OpenAIVisionProvider implements VisionProvider {
  async parseFloorPlan(input: FloorPlanInput): Promise<ParsedGraph> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")
    if (!input.data || !input.mimeType?.startsWith("image/")) {
      throw new Error(`Unsupported plan type for OpenAIVisionProvider: ${input.mimeType}`)
    }

    const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.data).toString("base64")}`
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the spatial graph as JSON." },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
    }

    const json = await res.json()
    const text: string = json.choices?.[0]?.message?.content ?? ""
    const raw = JSON.parse(text) as {
      nodes: Array<Record<string, unknown>>
      edges: ParsedEdge[]
    }

    const nodes: ParsedNode[] = (raw.nodes ?? []).map((n) => {
      const rawPts = Array.isArray(n.points) ? (n.points as unknown[]) : []
      const points: Point[] = rawPts
        .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
        .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
      // Prefer the polygon, but reject degenerate ones (GPT sometimes returns a
      // line spanning the image) and fall back to the reliable bounding box.
      const usePoly = polygonOk(points)
      const bounds = (n.bounds as ParsedNode["bounds"]) ?? undefined
      const cx = usePoly
        ? points.reduce((s, p) => s + p.x, 0) / points.length
        : bounds
          ? bounds.x + bounds.w / 2
          : 0
      const cy = usePoly
        ? points.reduce((s, p) => s + p.y, 0) / points.length
        : bounds
          ? bounds.y + bounds.h / 2
          : 0
      return {
        tempId: String(n.tempId),
        type: n.type as ParsedNode["type"],
        name: (n.name as string | null) ?? null,
        description: null,
        floor: Number(n.floor ?? 0),
        pos_x: Number(n.pos_x ?? cx * 800),
        pos_y: Number(n.pos_y ?? cy * 600),
        points: usePoly ? points : undefined,
        bounds,
      }
    })

    return { nodes, edges: raw.edges ?? [] }
  }

  async analyzePhoto(input: FloorPlanInput): Promise<PhotoAnalysis> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")
    if (!input.data || !input.mimeType?.startsWith("image/")) {
      throw new Error(`Unsupported photo type: ${input.mimeType}`)
    }

    const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.data).toString("base64")}`
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANALYZE_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this room photo as JSON." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)

    const json = await res.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}")
    return {
      objects: parsed.objects ?? [],
      landmarks: parsed.landmarks ?? [],
      signs: parsed.signs ?? [],
      synonyms: parsed.synonyms ?? [],
    }
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: EMBEDDING_DIM,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text()}`)

    const json = await res.json()
    return json.data[0].embedding as number[]
  }
}
