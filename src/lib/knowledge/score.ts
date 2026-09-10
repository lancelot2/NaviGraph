import { PASSAGE_NODE_TYPES } from "@/lib/graph/types"
import type { SpatialGraph, NodeType } from "@/lib/graph/types"

// The Knowledge Builder scores how complete a building's spatial memory is and,
// crucially, reports exactly what is missing so the enrichment assistant
// (Prompt 4) can ask for it. Pure and deterministic — fixed weights, no ML.

export type IssueType =
  | "no_name"
  | "no_photo"
  | "uncertain_connection"
  | "no_main_entrance"

export type KnowledgeIssue = {
  id: string
  type: IssueType
  label: string
  nodeId?: string
  edgeId?: string
}

export type Knowledge = {
  score: number // 0..100
  issues: KnowledgeIssue[]
  counts: Record<IssueType, number>
}

// Node types that represent a physical place we expect to name, photograph and
// describe. Landmarks are features inside rooms, so they only need a name.
const PLACE_TYPES = new Set<NodeType>(["room", "entrance", "stair", "elevator"])
// Passage nodes (door/window/…) are graph connectors, not places to name or
// photograph, so they are skipped by the knowledge score.
const PASSAGE_TYPES = new Set<NodeType>(PASSAGE_NODE_TYPES)
const MAIN_ENTRANCE_WEIGHT = 3

function hasText(v: string | null): boolean {
  return !!v && v.trim().length > 0
}

function displayName(name: string | null, type: NodeType): string {
  return hasText(name) ? `"${name!.trim()}"` : `Unnamed ${type}`
}

export function computeKnowledge(
  graph: SpatialGraph,
  photoNodeIds: Set<string>,
): Knowledge {
  const issues: KnowledgeIssue[] = []
  let total = 0
  let earned = 0

  const nameById = new Map(graph.nodes.map((n) => [n.id, n.name]))

  for (const node of graph.nodes) {
    if (PASSAGE_TYPES.has(node.type)) continue // connectors, not places
    total += 1
    if (hasText(node.name)) earned += 1
    else
      issues.push({
        id: `no_name:${node.id}`,
        type: "no_name",
        nodeId: node.id,
        label: `Unnamed ${node.type}`,
      })

    if (PLACE_TYPES.has(node.type)) {
      total += 1
      if (photoNodeIds.has(node.id)) earned += 1
      else
        issues.push({
          id: `no_photo:${node.id}`,
          type: "no_photo",
          nodeId: node.id,
          label: `${displayName(node.name, node.type)} has no photo`,
        })
    }
  }

  for (const edge of graph.edges) {
    total += 1
    if (edge.certain) earned += 1
    else {
      const src = displayName(nameById.get(edge.source) ?? null, "room")
      const tgt = displayName(nameById.get(edge.target) ?? null, "room")
      issues.push({
        id: `uncertain_connection:${edge.id}`,
        type: "uncertain_connection",
        edgeId: edge.id,
        label: `Uncertain connection: ${src} ↔ ${tgt}`,
      })
    }
  }

  // Missing a main entrance is weighted heavier.
  total += MAIN_ENTRANCE_WEIGHT
  if (graph.nodes.some((n) => n.type === "entrance")) {
    earned += MAIN_ENTRANCE_WEIGHT
  } else {
    issues.push({
      id: "no_main_entrance:graph",
      type: "no_main_entrance",
      label: "No main entrance defined",
    })
  }

  const counts: Record<IssueType, number> = {
    no_name: 0,
    no_photo: 0,
    uncertain_connection: 0,
    no_main_entrance: 0,
  }
  for (const i of issues) counts[i.type] += 1

  const score = total > 0 ? Math.round((100 * earned) / total) : 100
  return { score, issues, counts }
}
