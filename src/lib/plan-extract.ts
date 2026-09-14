import type { ExtractedGraphJSON } from "@/lib/vision/extracted"

// Public URL of the Python /extractor service. Read in the BROWSER (hence
// NEXT_PUBLIC_), so the heavy plan→graph call runs off Netlify — whose Free
// functions cap at ~10s, too short for the full pipeline.
export const EXTRACTOR_URL = process.env.NEXT_PUBLIC_EXTRACTOR_URL

// Extraction parameters (ExtractorParams JSON). The service defaults (Otsu, no
// wall-closing) detect NOTHING on real greyscale plans — adaptive thresholding
// plus wall-closing is what makes rooms segment. Override per deployment with
// NEXT_PUBLIC_EXTRACTOR_PARAMS (raise min_region_area_pct to merge tiny areas).
const DEFAULT_PARAMS = JSON.stringify({
  binarization: "adaptive",
  wall_close_ksize: 7,
  min_region_area_pct: 0.05,
})

// Sends the plan image straight from the browser to the extractor and returns
// its spatial-graph JSON. The browser has no request timeout, so a slow/cold
// service is fine here (unlike a serverless function).
export async function extractViaRender(file: Blob): Promise<ExtractedGraphJSON> {
  if (!EXTRACTOR_URL) throw new Error("NEXT_PUBLIC_EXTRACTOR_URL is not set")

  const form = new FormData()
  form.append("file", file, "plan.png")
  form.append("params", process.env.NEXT_PUBLIC_EXTRACTOR_PARAMS || DEFAULT_PARAMS)

  const res = await fetch(`${EXTRACTOR_URL.replace(/\/$/, "")}/extract`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Extractor error ${res.status}: ${detail}`)
  }
  return (await res.json()) as ExtractedGraphJSON
}
