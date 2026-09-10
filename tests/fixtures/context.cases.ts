import type { SpatialGraph } from "@/lib/graph/types"
import type { CoreParams } from "@/lib/engine/core"

// Input cases for the cross-language context-parity contract. The expected
// outputs are generated from the TypeScript core (the canonical implementation)
// into tests/fixtures/context/cases.json, which both the TS and Python parity
// tests then assert against. Edit inputs here, regenerate with
// `UPDATE_FIXTURES=1 npx vitest run tests/context-parity.test.ts`.

// A small two-floor building exercising every branch of the core: same-floor and
// multi-floor routes (via stair AND elevator), synonyms/landmarks/signs,
// an unnamed node, a disconnected node, and text-based localization.
const building: SpatialGraph = {
  nodes: [
    { id: "entrance", type: "entrance", name: "Main Entrance", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "lobby", type: "room", name: "Lobby", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: { synonyms: ["reception"] } },
    { id: "corridor", type: "room", name: "Corridor", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "meeting", type: "room", name: "Meeting Room", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    {
      id: "storage",
      type: "room",
      name: "Storage Room",
      description: "Where cleaning and office supplies are kept.",
      floor: 0,
      pos_x: 0,
      pos_y: 0,
      metadata: {
        synonyms: ["supply room", "stockroom"],
        landmarks: ["Metal shelves"],
        signs: ["STORAGE"],
      },
    },
    { id: "stair", type: "stair", name: "Staircase", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "elevator", type: "elevator", name: "Elevator", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "office", type: "room", name: "Office", description: null, floor: 1, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "vault", type: "room", name: "Vault", description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
    { id: "u1", type: "room", name: null, description: null, floor: 0, pos_x: 0, pos_y: 0, metadata: {} },
  ],
  edges: [
    { id: "e1", source: "entrance", target: "lobby", type: "connected_to", certain: true },
    { id: "e2", source: "lobby", target: "corridor", type: "connected_to", certain: true },
    { id: "e3", source: "corridor", target: "meeting", type: "connected_to", certain: true },
    { id: "e4", source: "corridor", target: "storage", type: "connected_to", certain: false },
    { id: "e5", source: "corridor", target: "stair", type: "connected_to", certain: true },
    { id: "e6", source: "lobby", target: "elevator", type: "connected_to", certain: true },
    { id: "e7", source: "stair", target: "office", type: "connected_to", certain: true },
    { id: "e8", source: "elevator", target: "office", type: "connected_to", certain: true },
    { id: "e9", source: "corridor", target: "u1", type: "connected_to", certain: true },
  ],
}

export type ParityCase = {
  name: string
  graph: SpatialGraph
  request: CoreParams
}

export const cases: ParityCase[] = [
  {
    name: "override_same_floor",
    graph: building,
    request: { instruction: "go to the meeting room", currentLocation: "Lobby" },
  },
  {
    name: "destination_after_to_with_synonym",
    graph: building,
    request: { instruction: "take me to the supply room", currentLocation: "Main Entrance" },
  },
  {
    name: "multi_floor_via_elevator",
    graph: building,
    request: { instruction: "go to the office", currentLocation: "Lobby" },
  },
  {
    name: "multi_floor_via_stair",
    graph: building,
    request: { instruction: "go to the office", currentLocation: "Meeting Room" },
  },
  {
    name: "localize_from_instruction_from_to",
    graph: building,
    request: { instruction: "from the lobby to the meeting room" },
  },
  {
    name: "localize_from_instruction_currently_in",
    graph: building,
    request: { instruction: "I am currently in the corridor, go to the office" },
  },
  {
    name: "image_localized_node_id",
    graph: building,
    request: { instruction: "go to the storage room", localizedNodeId: "lobby" },
  },
  {
    name: "current_equals_destination",
    graph: building,
    request: { instruction: "go to the lobby", currentLocation: "Lobby" },
  },
  {
    name: "unnamed_current_node",
    graph: building,
    request: { instruction: "go to the office", currentLocation: "u1" },
  },
  {
    name: "unresolved_destination",
    graph: building,
    request: { instruction: "go to the rooftop helipad", currentLocation: "Lobby" },
  },
  {
    name: "disconnected_destination",
    graph: building,
    request: { instruction: "go to the vault", currentLocation: "Lobby" },
  },
  {
    name: "could_not_determine_location",
    graph: building,
    request: { instruction: "go somewhere nice" },
  },
]
