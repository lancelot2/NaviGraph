import { getVisionProvider } from "./index"
import type { FloorPlanInput, ParsedGraph } from "./types"

// Étape 1 — semantic plan analysis (VLM/mock).
//
// Named seam over the configured VisionProvider: turns a plan image into the
// topological graph (rooms/entrances/stairs/… + connection edges), with each
// node carrying its layout anchor (pos_x/pos_y) and, when the VLM provides one,
// a rough bounds/points outline. Geometry is sharpened afterwards by
// polygonVectorizationService (Étape 2).
export function analyzePlan(input: FloorPlanInput): Promise<ParsedGraph> {
  return getVisionProvider().parseFloorPlan(input)
}
