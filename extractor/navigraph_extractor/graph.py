"""Étape 5 — graph construction (pure, deterministic).

Assembles a bipartite graph where passages are first-class NODES (not mere
edges) sitting between the two spaces they connect. The semantic filter — keep
only space<->passage links, never passage<->passage — is enforced by
construction: edges are only ever created from a passage to its two regions.

Edges are typed by robot capability profile ("ground" = doors; "uav" = + windows
and open passages) and carry a weight for penalties. The profile is a query-time
parameter; the graph itself stays single and complete.
"""

from __future__ import annotations

from .config import ExtractorParams
from .labeling.base import PassageLabel, PassageType, RegionLabel
from .schema import (
    ExtractedEdge,
    ExtractedGraph,
    ExtractedNode,
    PassageCandidate,
    Region,
)

# Which capability profiles may traverse each passage type.
_PROFILES: dict[PassageType, tuple[str, ...]] = {
    PassageType.DOOR: ("ground", "uav"),
    PassageType.ENTRANCE_DOOR: ("ground", "uav"),
    PassageType.WINDOW: ("uav",),
    PassageType.OPENING: ("uav",),
}


def _norm_point(x: float, y: float, w: int, h: int) -> tuple[float, float]:
    return (x / w, y / h)


def _space_nodes(
    regions: list[Region], region_labels: list[RegionLabel], w: int, h: int
) -> list[ExtractedNode]:
    """One space (room) node per region. Names come from the labeler."""
    labels_by_region = {label.region_id: label for label in region_labels}
    nodes: list[ExtractedNode] = []
    for region in regions:
        rl = labels_by_region.get(region.id)
        nodes.append(
            ExtractedNode(
                id=f"r{region.id}",
                kind="space",
                type="room",
                label=rl.label if rl else None,
                confidence=rl.confidence if rl else 0.0,
                polygon=[_norm_point(x, y, w, h) for (x, y) in region.polygon],
                centroid=_norm_point(region.centroid[0], region.centroid[1], w, h),
            )
        )
    return nodes


def build_graph(
    regions: list[Region],
    candidates: list[PassageCandidate],
    region_labels: list[RegionLabel],
    passage_labels: list[PassageLabel],
    shape: tuple[int, int],
    params: ExtractorParams,
) -> ExtractedGraph:
    """Build the bipartite space<->passage graph from geometry + labels."""
    h, w = shape
    labels_by_passage = {label.passage_id: label for label in passage_labels}
    cand_by_id = {c.id: c for c in candidates}

    nodes: list[ExtractedNode] = _space_nodes(regions, region_labels, w, h)
    edges: list[ExtractedEdge] = []
    region_ids: set[int] = {r.id for r in regions}

    # Passages: one node per real passage, wired to BOTH its regions.
    for cand in candidates:
        plabel = labels_by_passage.get(cand.id)
        if plabel is None or not plabel.is_passage:
            continue  # false positives never enter the graph
        a, b = cand.region_ids
        if a not in region_ids or b not in region_ids:
            continue  # dangling candidate; skip

        pid = f"p{cand.id}"
        b0 = cand.bbox
        polygon = [
            _norm_point(b0.x, b0.y, w, h),
            _norm_point(b0.x + b0.w, b0.y, w, h),
            _norm_point(b0.x + b0.w, b0.y + b0.h, w, h),
            _norm_point(b0.x, b0.y + b0.h, w, h),
        ]
        nodes.append(
            ExtractedNode(
                id=pid,
                kind="passage",
                type=plabel.type.value,
                label=None,
                confidence=plabel.confidence,
                polygon=polygon,
                centroid=_norm_point(cand.centroid[0], cand.centroid[1], w, h),
            )
        )

        profiles = _PROFILES.get(plabel.type, ())
        certain = plabel.confidence >= params.passage_certain_threshold
        weight = 1.0
        if params.narrow_passage_px > 0 and min(b0.w, b0.h) < params.narrow_passage_px:
            weight += params.narrow_passage_penalty

        for space_id in (f"r{a}", f"r{b}"):
            edges.append(
                ExtractedEdge(
                    source=space_id,
                    target=pid,
                    certain=certain,
                    weight=weight,
                    profiles=profiles,
                )
            )

    return ExtractedGraph(nodes=nodes, edges=edges, width=w, height=h)


def build_graph_from_connections(
    regions: list[Region],
    region_labels: list[RegionLabel],
    connections: list[tuple[int, int]],
    shape: tuple[int, int],
) -> ExtractedGraph:
    """Hybrid graph: rooms from CV geometry, connections from the LLM.

    Produces direct room<->room `connected_to` edges (no passage nodes) — the
    topology comes from recognition, not from region-overlap geometry.
    """
    h, w = shape
    nodes = _space_nodes(regions, region_labels, w, h)
    region_ids = {r.id for r in regions}

    edges: list[ExtractedEdge] = []
    seen: set[tuple[int, int]] = set()
    for a, b in connections:
        if a == b or a not in region_ids or b not in region_ids:
            continue
        key = (min(a, b), max(a, b))
        if key in seen:
            continue
        seen.add(key)
        edges.append(
            ExtractedEdge(
                source=f"r{key[0]}",
                target=f"r{key[1]}",
                certain=True,
                weight=1.0,
                profiles=("ground", "uav"),
            )
        )
    return ExtractedGraph(nodes=nodes, edges=edges, width=w, height=h)
