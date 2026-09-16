import type { ExtractedNodeJSON, ExtractedEdgeJSON } from "@/lib/vision/extracted"
import type { Point } from "@/lib/graph/types"

// Public URL of the Python extractor/colorize service. Read in the BROWSER
// (NEXT_PUBLIC_) so the heavy plan processing runs off Netlify, whose Free
// functions cap at ~10s.
export const EXTRACTOR_URL = process.env.NEXT_PUBLIC_EXTRACTOR_URL

export type ColorizeResult = {
  // Base64-encoded PNG of the plan with each room coloured up to the walls.
  overlay_png_b64: string
  // Simple room + adjacency graph (VLM, best-effort; may be empty).
  nodes: ExtractedNodeJSON[]
  edges: ExtractedEdgeJSON[]
}

// Sends the plan straight from the browser to /colorize and returns the coloured
// overlay + a simple room/adjacency graph. No request timeout in the browser, so
// a slow/cold service or a slow VLM call is fine here.
//
// - opts.polygons: hand-drawn room outlines (normalized [0,1]) to paint on the
//   overlay so a room traced by hand shows up on the coloured plan.
// - opts.detect: pass false to only re-colour (skips room detection), so a
//   re-colour after adding a room by hand never wipes the existing graph.
export async function colorizePlan(
  file: Blob,
  opts?: { polygons?: Point[][]; detect?: boolean },
): Promise<ColorizeResult> {
  if (!EXTRACTOR_URL) throw new Error("NEXT_PUBLIC_EXTRACTOR_URL is not set")

  const form = new FormData()
  form.append("file", file, "plan.png")
  if (opts?.polygons?.length) {
    form.append("polygons", JSON.stringify(opts.polygons))
  }
  if (opts?.detect === false) {
    form.append("detect", "false")
  }

  const res = await fetch(`${EXTRACTOR_URL.replace(/\/$/, "")}/colorize`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Colorize error ${res.status}: ${detail}`)
  }
  return (await res.json()) as ColorizeResult
}
