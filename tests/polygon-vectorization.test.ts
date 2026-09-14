import { describe, it, expect } from "vitest"
import {
  associatePolygons,
  type ExtractedSpace,
} from "@/lib/vision/polygonVectorizationService"
import type { ParsedGraph, ParsedNode } from "@/lib/vision/types"

// Anchors are pos_x/pos_y on an 800×600 canvas; the fusion divides them back to
// normalized [0,1] to test containment against extractor polygons.
function node(tempId: string, nx: number, ny: number): ParsedNode {
  return {
    tempId,
    type: "room",
    name: tempId,
    description: null,
    floor: 0,
    pos_x: nx * 800,
    pos_y: ny * 600,
  }
}

const square = (x: number, y: number, s: number): ExtractedSpace["polygon"] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]

describe("associatePolygons", () => {
  it("assigns the containing polygon to a node by its anchor", () => {
    const graph: ParsedGraph = { nodes: [node("a", 0.2, 0.2)], edges: [] }
    const spaces: ExtractedSpace[] = [
      { id: "s1", polygon: square(0.1, 0.1, 0.2) }, // contains (0.2,0.2)
      { id: "s2", polygon: square(0.6, 0.6, 0.2) },
    ]
    const out = associatePolygons(graph, spaces)
    expect(out.nodes[0].points).toEqual(spaces[0].polygon)
  })

  it("prefers the smallest polygon when several contain the anchor", () => {
    const graph: ParsedGraph = { nodes: [node("a", 0.5, 0.5)], edges: [] }
    const spaces: ExtractedSpace[] = [
      { id: "big", polygon: square(0.0, 0.0, 1.0) },
      { id: "small", polygon: square(0.4, 0.4, 0.2) },
    ]
    const out = associatePolygons(graph, spaces)
    expect(out.nodes[0].points).toEqual(spaces[1].polygon)
  })

  it("falls back to the nearest centroid when no polygon contains the anchor", () => {
    const graph: ParsedGraph = { nodes: [node("a", 0.5, 0.52)], edges: [] }
    const spaces: ExtractedSpace[] = [
      { id: "near", polygon: square(0.4, 0.4, 0.2) }, // centroid (0.5,0.5)
    ]
    const out = associatePolygons(graph, spaces)
    expect(out.nodes[0].points).toEqual(spaces[0].polygon)
  })

  it("keeps the node's VLM geometry when nothing matches", () => {
    const original = node("a", 0.05, 0.05)
    original.bounds = { x: 0, y: 0, w: 0.05, h: 0.05 }
    const graph: ParsedGraph = { nodes: [original], edges: [] }
    const spaces: ExtractedSpace[] = [{ id: "far", polygon: square(0.7, 0.7, 0.2) }]
    const out = associatePolygons(graph, spaces)
    expect(out.nodes[0].points).toBeUndefined()
    expect(out.nodes[0].bounds).toEqual({ x: 0, y: 0, w: 0.05, h: 0.05 })
  })

  it("claims each polygon at most once", () => {
    const graph: ParsedGraph = {
      nodes: [node("a", 0.5, 0.5), node("b", 0.5, 0.5)],
      edges: [],
    }
    const spaces: ExtractedSpace[] = [{ id: "s1", polygon: square(0.4, 0.4, 0.2) }]
    const out = associatePolygons(graph, spaces)
    expect(out.nodes[0].points).toEqual(spaces[0].polygon)
    expect(out.nodes[1].points).toBeUndefined()
  })
})
