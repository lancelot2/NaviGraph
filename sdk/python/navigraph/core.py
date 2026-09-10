"""The context CORE — a byte-for-byte port of src/lib/engine/core.ts.

Pure and dependency-free: destination resolution, text-based localization,
path planning, and context-string generation. It performs NO I/O and NO model
calls, so it runs identically to the hosted TypeScript engine.

The parity contract: for the same graph and inputs, this MUST produce output
identical to the TypeScript core. That is enforced by the shared fixtures in
tests/fixtures/context/cases.json (see tests/test_parity.py). Any change here
must be mirrored in core.ts and the fixtures regenerated.
"""

from __future__ import annotations

import re
from collections import deque
from typing import Optional

from .types import ContextResult, CoreParams, GraphNode, SpatialGraph

# --- graph primitives (port of src/lib/graph/algo.ts) ----------------------


def find_node(graph: SpatialGraph, query: str) -> Optional[GraphNode]:
    """Find a node by exact id, or by case-insensitive name match."""
    by_id = next((n for n in graph.nodes if n.id == query), None)
    if by_id is not None:
        return by_id
    q = query.strip().lower()
    return next(
        (n for n in graph.nodes if (n.name or "").strip().lower() == q), None
    )


def find_path(
    graph: SpatialGraph, source_id: str, target_id: str
) -> Optional[list[str]]:
    """Shortest topological path (by hop count). Edges are bidirectional.

    Returns the ordered list of node ids, or None if unreachable. The traversal
    order mirrors the TS BFS exactly so any tie is broken identically.
    """
    if source_id == target_id:
        return [source_id]

    adjacency: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    for e in graph.edges:
        if e.source in adjacency:
            adjacency[e.source].append(e.target)
        if e.target in adjacency:
            adjacency[e.target].append(e.source)

    queue: deque[str] = deque([source_id])
    came_from: dict[str, Optional[str]] = {source_id: None}

    while queue:
        current = queue.popleft()
        if current == target_id:
            break
        for nxt in adjacency.get(current, []):
            if nxt not in came_from:
                came_from[nxt] = current
                queue.append(nxt)

    if target_id not in came_from:
        return None

    path: list[str] = []
    step: Optional[str] = target_id
    while step is not None:
        path.insert(0, step)
        step = came_from.get(step)
    return path


# --- context core (port of src/lib/engine/core.ts) -------------------------


def node_name(n: GraphNode) -> str:
    return (n.name or "").strip() or f"unnamed {n.type}"


def _match_node_in_text(
    graph: SpatialGraph, text: str, exclude_id: Optional[str] = None
) -> Optional[GraphNode]:
    lower = text.lower()
    best: Optional[GraphNode] = None
    best_len = 0

    for node in graph.nodes:
        if exclude_id and node.id == exclude_id:
            continue
        meta = node.metadata
        candidates = (
            [node.name or ""]
            + list(meta.get("synonyms") or [])
            + list(meta.get("landmarks") or [])
            + list(meta.get("signs") or [])
        )
        for c in candidates:
            key = c.strip().lower()
            if len(key) >= 3 and key in lower and len(key) > best_len:
                best = node
                best_len = len(key)
    return best


def _resolve_destination(
    graph: SpatialGraph, instruction: str, exclude_id: Optional[str] = None
) -> Optional[GraphNode]:
    m = re.search(r"\bto\s+(.+)$", instruction.lower())
    after_to = m.group(1) if m else None
    result = (
        _match_node_in_text(graph, after_to, exclude_id)
        if after_to
        else None
    )
    if result is not None:
        return result
    return _match_node_in_text(graph, instruction, exclude_id)


_CUES = [
    r"\bfrom\s+(.+?)(?:\s+to\b|[.,;]|$)",
    r"\bi(?:'m| am)\s+(?:currently\s+)?(?:in|at|inside)\s+(.+?)(?:[.,;]|$)",
    r"\bcurrently\s+(?:in|at)\s+(.+?)(?:[.,;]|$)",
    r"\bstart(?:ing)?\s+(?:from|at|in)\s+(.+?)(?:\s+to\b|[.,;]|$)",
]


def _localize_from_instruction(
    graph: SpatialGraph, instruction: str
) -> Optional[GraphNode]:
    text = instruction.lower()
    for pat in _CUES:
        m = re.search(pat, text)
        if m:
            phrase = m.group(1)
            node = _match_node_in_text(graph, phrase)
            if node is not None:
                return node
    return None


def _build_context(
    graph: SpatialGraph,
    current: GraphNode,
    destination: GraphNode,
    path_ids: list[str],
) -> str:
    by_id = {n.id: n for n in graph.nodes}
    nodes = [by_id[i] for i in path_ids]
    names = [node_name(n) for n in nodes]
    multi_floor = len({n.floor for n in nodes}) > 1

    lines: list[str] = []
    lines.append(
        f"You are in {node_name(current)}. Goal: reach {node_name(destination)}."
    )
    lines.append(
        f"Route: {' → '.join(names)} ({len(nodes)} nodes, "
        f"{'multiple floors' if multi_floor else 'same floor'})."
    )

    for i in range(1, len(nodes)):
        frm = nodes[i - 1]
        to = nodes[i]
        step = f"Step {i}: From {node_name(frm)}, proceed to {node_name(to)}."
        if to.type == "stair":
            step += f" Take the stairs to floor {to.floor}."
        elif to.type == "elevator":
            step += f" Take the elevator to floor {to.floor}."
        elif frm.floor != to.floor:
            step += f" This changes floor to {to.floor}."
        lines.append(step)

    landmarks = list(destination.metadata.get("landmarks") or [])
    signs = list(destination.metadata.get("signs") or [])
    if landmarks or signs:
        lines.append(f"Destination landmarks: {', '.join(landmarks + signs)}.")
    desc = destination.description
    if desc and desc.strip():
        lines.append(f"About {node_name(destination)}: {desc.strip()}")

    return "\n".join(lines)


def _resolve_current(
    graph: SpatialGraph, params: CoreParams
) -> Optional[GraphNode]:
    if params.current_location:
        return find_node(graph, params.current_location)
    if params.localized_node_id:
        return next(
            (n for n in graph.nodes if n.id == params.localized_node_id), None
        )
    return None


def generate_context_from_graph(
    graph: SpatialGraph, params: CoreParams
) -> ContextResult:
    """The deterministic pipeline: localization → resolution → planning → context."""
    current = _resolve_current(graph, params) or _localize_from_instruction(
        graph, params.instruction
    )
    if current is None:
        return ContextResult(
            current_location=None,
            destination=None,
            path=[],
            landmarks=[],
            context=(
                "Could not determine the robot's current location. Provide a "
                "camera frame, pass `current_location` (a room name), or name "
                'the starting room in the instruction (e.g. "from the lobby to '
                '…").'
            ),
        )

    destination = _resolve_destination(graph, params.instruction, current.id)
    if destination is None:
        return ContextResult(
            current_location=node_name(current),
            destination=None,
            path=[],
            landmarks=[],
            context=(
                f"You are in {node_name(current)}, but the destination in "
                f'"{params.instruction}" could not be matched to a known room.'
            ),
        )

    landmarks = list(destination.metadata.get("landmarks") or [])

    path_ids = find_path(graph, current.id, destination.id)
    if path_ids is None:
        return ContextResult(
            current_location=node_name(current),
            destination=node_name(destination),
            path=[],
            landmarks=landmarks,
            context=(
                f"You are in {node_name(current)}. No route to "
                f"{node_name(destination)} exists in the current spatial graph "
                "— the buildings may be disconnected."
            ),
        )

    context = _build_context(graph, current, destination, path_ids)
    by_id = {n.id: n for n in graph.nodes}
    return ContextResult(
        current_location=node_name(current),
        destination=node_name(destination),
        path=[node_name(by_id[i]) for i in path_ids],
        landmarks=landmarks,
        context=context,
    )
