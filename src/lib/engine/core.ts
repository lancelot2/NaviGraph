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

// Ordinal / qualifier synonyms folded onto a canonical digit token, so
// "secondary bedroom" matches "Bedroom 2" and "master bedroom" matches
// "Bedroom 1". Kept small and shared with the Python core for parity.
const ORDINALS: Record<string, string> = {
  first: "1", primary: "1", main: "1", master: "1", "1st": "1",
  second: "2", secondary: "2", "2nd": "2",
  third: "3", tertiary: "3", "3rd": "3",
  fourth: "4", "4th": "4",
  fifth: "5", "5th": "5",
  sixth: "6", "6th": "6",
}
// Tokens dropped from a candidate name before token-matching (structural words
// a natural instruction won't repeat verbatim).
const STOP = new Set(["of", "the", "a", "an", "and", "or"])

// Split into lowercased alphanumeric tokens, folding ordinal synonyms to digits.
function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ORDINALS[w] ?? w)
}

// A candidate's tokens minus structural stop-words.
function significantTokens(s: string): string[] {
  return normalizeTokens(s).filter((t) => !STOP.has(t))
}

// Find the room whose name, synonyms, or photo/tag-derived landmarks/signs best
// appear in `text`. Two passes: (1) substring match — longest wins, the strong,
// precise signal; (2) if nothing matched, a token-subset fallback so paraphrases
// like "the secondary bedroom" resolve to "Bedroom 2".
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
    for (const c of candidatesOf(node)) {
      const key = c.trim().toLowerCase()
      if (key.length >= 3 && lower.includes(key) && key.length > bestLen) {
        best = node
        bestLen = key.length
      }
    }
  }
  if (best) return best

  // Fallback: every significant token of a candidate appears in the text (order
  // independent). Requires a distinctive (≥3-char) token so a lone digit or
  // short word can't match on its own. More matched tokens = more specific.
  const textTokens = new Set(normalizeTokens(text))
  let bestScore = 0
  for (const node of graph.nodes) {
    if (excludeId && node.id === excludeId) continue
    for (const c of candidatesOf(node)) {
      const toks = significantTokens(c)
      if (toks.length === 0 || !toks.some((t) => t.length >= 3)) continue
      if (toks.every((t) => textTokens.has(t)) && toks.length > bestScore) {
        best = node
        bestScore = toks.length
      }
    }
  }
  return best
}

function candidatesOf(node: GraphNode): string[] {
  return [
    node.name ?? "",
    ...(node.metadata.synonyms ?? []),
    ...(node.metadata.landmarks ?? []),
    ...(node.metadata.signs ?? []),
  ]
}

// Destination phrase cues, tried in order of signal strength: motion ("go TO the
// office", "INTO the hall") beats a locative ("the book IN the bedroom"), which
// beats matching the whole instruction. `excludeId` keeps the resolved origin
// from also being picked as the destination in "from A to B" phrasings.
const MOTION_CUE = /\b(?:to|into|towards?|onto)\s+(.+)$/
const LOCATIVE_CUE = /\b(?:in|inside|within|at)\s+(.+)$/

function resolveDestination(
  graph: SpatialGraph,
  instruction: string,
  excludeId?: string,
): GraphNode | null {
  const lower = instruction.toLowerCase()
  const motion = lower.match(MOTION_CUE)?.[1]
  const locative = lower.match(LOCATIVE_CUE)?.[1]
  return (
    (motion ? matchNodeInText(graph, motion, excludeId) : null) ??
    (locative ? matchNodeInText(graph, locative, excludeId) : null) ??
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
