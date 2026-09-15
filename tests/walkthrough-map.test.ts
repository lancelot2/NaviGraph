import { describe, it, expect } from "vitest"
import { mapExtractedToParsed } from "@/lib/vision/extracted"

// The /walkthrough endpoint returns the ExtractedGraphJSON shape with per-room
// `objects`; mapExtractedToParsed must carry them onto the ParsedNode so
// persistParsedGraph stores them in metadata.objects.
describe("mapExtractedToParsed — walkthrough objects", () => {
  it("carries per-room objects onto the parsed node", () => {
    const g = mapExtractedToParsed({
      nodes: [
        {
          id: "0",
          kind: "space",
          type: "room",
          label: "Cuisine",
          confidence: 1,
          polygon: [],
          centroid: [0.1, 0.1],
          objects: ["frigo", "table"],
        },
      ],
      edges: [],
      width: 0,
      height: 0,
    })
    expect(g.nodes[0].name).toBe("Cuisine")
    expect(g.nodes[0].objects).toEqual(["frigo", "table"])
    expect(g.nodes[0].points).toBeUndefined() // no floor plan → no polygon
  })

  it("omits objects when none are provided", () => {
    const g = mapExtractedToParsed({
      nodes: [
        { id: "0", kind: "space", type: "room", label: "X", confidence: 1, polygon: [], centroid: [0, 0] },
      ],
      edges: [],
      width: 0,
      height: 0,
    })
    expect(g.nodes[0].objects).toBeUndefined()
  })
})
