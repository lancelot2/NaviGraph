import type { SpatialGraph, GraphNode } from "@/lib/graph/types"
import { findNode, findPath } from "@/lib/graph/algo"

// The context CORE — pure, dependency-free, and the single source of truth for
// destination resolution, text-based localization, planning, and context-string
// generation. It contains NO I/O and NO model calls, so it runs identically on
// the server, in tests, and (ported) in the Python SDK.
//
// The offline SDK path MUST produce byte-identical output to the hosted path for
// the same graph and inputs. That contract is enforced by tests/context-parity
// against shared fixtures; any change here must be mirrored in
// sdk/python/navigraph/core.py and the fixtures regenerated.

export type ContextResult = {
  current_location: string | null
  destination: string | null
  path: string[]
  landmarks: string[]
  context: string
}

// What the core needs to produce a result. Image-embedding localization is done
// by the caller (it is model-dependent and not part of the parity contract);
// its outcome arrives here as `localizedNodeId`.
export type CoreParams = {
  instruction: string
  // Manual override — a node id or name. Wins over everything.
  currentLocation?: string | null
  // A node id already resolved by image-embedding localization, if any.
  localizedNodeId?: string | null
}

export function nodeName(n: GraphNode): string {
  return n.name?.trim() || `unnamed ${n.type}`
}

// Find the room whose name, synonyms, or photo/tag-derived landmarks/signs best
// appear in `text` (longest match wins, to avoid weak partial hits).
function matchNodeInText(
  graph: SpatialGraph,
  text: string,
  excludeId?: string,
): GraphNode | null {
  const lower = text.toLowerCase()
  let best: GraphNode | null = null
  let bestLen = 0

  for (const node of graph.nodes) {
    if (excludeId && node.id === excludeId) continue
    const candidates = [
      node.name ?? "",
      ...(node.metadata.synonyms ?? []),
      ...(node.metadata.landmarks ?? []),
      ...(node.metadata.signs ?? []),
    ]
    for (const c of candidates) {
      const key = c.trim().toLowerCase()
      if (key.length >= 3 && lower.includes(key) && key.length > bestLen) {
        best = node
        bestLen = key.length
      }
    }
  }
  return best
}

// Resolve the destination node from a free-text instruction. Prefer the phrase
// after "to" (the strongest destination signal), falling back to the whole
// instruction. `excludeId` keeps the resolved origin from also being picked as
// the destination in "from A to B" phrasings.
function resolveDestination(
  graph: SpatialGraph,
  instruction: string,
  excludeId?: string,
): GraphNode | null {
  const afterTo = instruction.toLowerCase().match(/\bto\s+(.+)$/)?.[1]
  return (
    (afterTo ? matchNodeInText(graph, afterTo, excludeId) : null) ??
    matchNodeInText(graph, instruction, excludeId)
  )
}

// Text-only localization — when there's no camera frame, infer the robot's
// starting room from the instruction itself ("from the lobby to …",
// "I'm in the kitchen, go to …", "currently at reception").
function localizeFromInstruction(
  graph: SpatialGraph,
  instruction: string,
): GraphNode | null {
  const text = instruction.toLowerCase()
  const cues = [
    /\bfrom\s+(.+?)(?:\s+to\b|[.,;]|$)/,
    /\bi(?:'m| am)\s+(?:currently\s+)?(?:in|at|inside)\s+(.+?)(?:[.,;]|$)/,
    /\bcurrently\s+(?:in|at)\s+(.+?)(?:[.,;]|$)/,
    /\bstart(?:ing)?\s+(?:from|at|in)\s+(.+?)(?:\s+to\b|[.,;]|$)/,
  ]
  for (const re of cues) {
    const phrase = text.match(re)?.[1]
    if (phrase) {
      const node = matchNodeInText(graph, phrase)
      if (node) return node
    }
  }
  return null
}

// Context Generation. Plain text optimized for a navigation model.
function buildContext(
  graph: SpatialGraph,
  current: GraphNode,
  destination: GraphNode,
  pathIds: string[],
): string {
  const nodes = pathIds.map((id) => graph.nodes.find((n) => n.id === id)!)
  const names = nodes.map(nodeName)
  const multiFloor = new Set(nodes.map((n) => n.floor)).size > 1

  const lines: string[] = []
  lines.push(
    `You are in ${nodeName(current)}. Goal: reach ${nodeName(destination)}.`,
  )
  lines.push(
    `Route: ${names.join(" → ")} (${nodes.length} nodes, ${multiFloor ? "multiple floors" : "same floor"}).`,
  )

  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1]
    const to = nodes[i]
    let step = `Step ${i}: From ${nodeName(from)}, proceed to ${nodeName(to)}.`
    if (to.type === "stair") step += ` Take the stairs to floor ${to.floor}.`
    else if (to.type === "elevator")
      step += ` Take the elevator to floor ${to.floor}.`
    else if (from.floor !== to.floor) step += ` This changes floor to ${to.floor}.`
    lines.push(step)
  }

  const landmarks = destination.metadata.landmarks ?? []
  const signs = destination.metadata.signs ?? []
  if (landmarks.length || signs.length) {
    lines.push(`Destination landmarks: ${[...landmarks, ...signs].join(", ")}.`)
  }
  if (destination.description?.trim()) {
    lines.push(
      `About ${nodeName(destination)}: ${destination.description.trim()}`,
    )
  }

  return lines.join("\n")
}

// Resolve the current node from the manual override or a prior image
// localization, then fall back to inferring it from the instruction text.
function resolveCurrent(
  graph: SpatialGraph,
  params: CoreParams,
): GraphNode | null {
  if (params.currentLocation) {
    return findNode(graph, params.currentLocation) ?? null
  }
  if (params.localizedNodeId) {
    return graph.nodes.find((n) => n.id === params.localizedNodeId) ?? null
  }
  return null
}

// The deterministic pipeline: localization (text/override) → destination
// resolution → planning → context generation. Given a graph and inputs, the
// output is fully determined — this is the parity contract.
export function generateContextFromGraph(
  graph: SpatialGraph,
  params: CoreParams,
): ContextResult {
  const current =
    resolveCurrent(graph, params) ??
    localizeFromInstruction(graph, params.instruction)
  if (!current) {
    return {
      current_location: null,
      destination: null,
      path: [],
      landmarks: [],
      context:
        "Could not determine the robot's current location. Provide a camera frame, pass `current_location` (a room name), or name the starting room in the instruction (e.g. \"from the lobby to …\").",
    }
  }

  const destination = resolveDestination(graph, params.instruction, current.id)
  if (!destination) {
    return {
      current_location: nodeName(current),
      destination: null,
      path: [],
      landmarks: [],
      context: `You are in ${nodeName(current)}, but the destination in "${params.instruction}" could not be matched to a known room.`,
    }
  }

  const landmarks = destination.metadata.landmarks ?? []

  const pathIds = findPath(graph, current.id, destination.id)
  if (!pathIds) {
    return {
      current_location: nodeName(current),
      destination: nodeName(destination),
      path: [],
      landmarks,
      context: `You are in ${nodeName(current)}. No route to ${nodeName(destination)} exists in the current spatial graph — the buildings may be disconnected.`,
    }
  }

  const context = buildContext(graph, current, destination, pathIds)
  return {
    current_location: nodeName(current),
    destination: nodeName(destination),
    path: pathIds.map((id) => nodeName(graph.nodes.find((n) => n.id === id)!)),
    landmarks,
    context,
  }
}
