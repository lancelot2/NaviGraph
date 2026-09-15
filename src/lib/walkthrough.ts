import type { ExtractedNodeJSON, ExtractedEdgeJSON } from "@/lib/vision/extracted"
import { EXTRACTOR_URL } from "@/lib/plan-extract"

export type WalkthroughResult = {
  nodes: ExtractedNodeJSON[]
  edges: ExtractedEdgeJSON[]
  transcript: string
}

// Sends the narrated video + selected key frames (as file parts) to the Render
// /walkthrough endpoint, which transcribes (Whisper) and extracts the room graph
// (GPT). Runs off Netlify — the browser has no request timeout, so a long
// transcription/analysis is fine.
export async function analyzeWalkthrough(
  video: Blob,
  keyframes: Blob[],
): Promise<WalkthroughResult> {
  if (!EXTRACTOR_URL) throw new Error("NEXT_PUBLIC_EXTRACTOR_URL is not set")

  const form = new FormData()
  form.append("file", video, "walkthrough.webm")
  keyframes.forEach((f, i) => form.append("frames", f, `frame_${i}.jpg`))

  const res = await fetch(`${EXTRACTOR_URL.replace(/\/$/, "")}/walkthrough`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Walkthrough error ${res.status}: ${detail}`)
  }
  return (await res.json()) as WalkthroughResult
}
