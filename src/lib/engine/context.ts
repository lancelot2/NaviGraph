import "server-only"
import { getVisionProvider } from "@/lib/vision"
import type { SpatialGraph } from "@/lib/graph/types"
import { generateContextFromGraph, type ContextResult } from "./core"

export type { ContextResult } from "./core"

// How the engine reads a project's data — swappable so the same engine serves
// the in-app session (RLS) and external API-key requests (SECURITY DEFINER).
export type ContextDataSource = {
  loadGraph: () => Promise<SpatialGraph>
  matchLocation: (embedding: number[]) => Promise<string | null>
}

// NaviGraph's context engine. Turns an instruction + camera frame into a rich,
// plain-text navigation context for models like Robostral Navigate.

export type ContextRequest = {
  projectId: string
  instruction: string
  image?: string | null // data URL or bare base64
  currentLocation?: string | null // manual override (node id or name)
}

// data:image/png;base64,xxxx  OR  bare base64 -> bytes + mime
function parseImage(
  image: string,
): { data: Uint8Array; mimeType: string } | null {
  const m = image.match(/^data:(.+?);base64,(.*)$/)
  const mimeType = m ? m[1] : "image/jpeg"
  const b64 = m ? m[2] : image
  try {
    return { data: new Uint8Array(Buffer.from(b64, "base64")), mimeType }
  } catch {
    return null
  }
}

// Image-embedding localization — the only model-dependent, non-deterministic
// step. Embed the camera scene and find the nearest reference photo via
// pgvector. Skipped when a manual `currentLocation` is supplied (the core
// gives that precedence). Returns a node id, or null when localization yields
// nothing (the core then falls back to inferring from the instruction).
async function localizeFromImage(
  req: ContextRequest,
  ds: ContextDataSource,
): Promise<string | null> {
  if (req.currentLocation || !req.image) return null

  const parsed = parseImage(req.image)
  if (!parsed) return null

  const provider = getVisionProvider()
  const analysis = await provider.analyzePhoto(parsed)
  const sceneText = [
    ...analysis.objects,
    ...analysis.landmarks,
    ...analysis.signs,
    ...analysis.synonyms,
  ]
    .filter(Boolean)
    .join(", ")
  if (!sceneText) return null

  const embedding = await provider.embed(sceneText)
  return ds.matchLocation(embedding)
}

export async function generateContext(
  req: ContextRequest,
  ds: ContextDataSource,
): Promise<ContextResult> {
  const graph = await ds.loadGraph()
  const localizedNodeId = await localizeFromImage(req, ds)

  return generateContextFromGraph(graph, {
    instruction: req.instruction,
    currentLocation: req.currentLocation,
    localizedNodeId,
  })
}
