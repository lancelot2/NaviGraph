import type { ExtractedNodeJSON, ExtractedEdgeJSON } from "@/lib/vision/extracted"

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
export async function colorizePlan(file: Blob): Promise<ColorizeResult> {
  if (!EXTRACTOR_URL) throw new Error("NEXT_PUBLIC_EXTRACTOR_URL is not set")

  const form = new FormData()
  form.append("file", file, "plan.png")

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
