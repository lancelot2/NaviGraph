"""Étape 6 — visual debugging (built alongside each stage, not after).

Each stage can render an annotated BGR image; callers save it with `save_png`.
More renderers (regions, passages, graph) are added as those stages land.
"""

from __future__ import annotations

import cv2
import numpy as np

from .preprocess import PreprocessResult
from .schema import ExtractedGraph, PassageCandidate, Region

# Distinct BGR colors cycled across regions/passages.
_PALETTE = [
    (231, 76, 60),
    (46, 204, 113),
    (52, 152, 219),
    (155, 89, 182),
    (241, 196, 15),
    (26, 188, 156),
    (230, 126, 34),
    (149, 165, 166),
]


def _color(i: int) -> tuple[int, int, int]:
    return _PALETTE[i % len(_PALETTE)]


def save_png(path: str, image_bgr: np.ndarray) -> None:
    """Write a BGR image to `path` as PNG."""
    if not cv2.imwrite(path, image_bgr):
        raise IOError(f"Failed to write PNG to {path}")


def render_binarization(result: PreprocessResult) -> np.ndarray:
    """White background, walls in black, and text-removed pixels in red."""
    h, w = result.walls.shape[:2]
    canvas = np.full((h, w, 3), 255, dtype=np.uint8)
    canvas[result.walls > 0] = (0, 0, 0)  # walls -> black
    if result.text_mask is not None:
        canvas[result.text_mask > 0] = (0, 0, 255)  # removed text -> red (BGR)
    return canvas


def render_regions(gray: np.ndarray, regions: list[Region]) -> np.ndarray:
    """Plan (dimmed) with each region outlined in color and numbered at centroid."""
    base = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    canvas = cv2.addWeighted(base, 0.4, np.full_like(base, 255), 0.6, 0)
    for region in regions:
        color = _color(region.id)
        pts = np.array(region.polygon, dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], isClosed=True, color=color, thickness=2)
        cx, cy = int(region.centroid[0]), int(region.centroid[1])
        cv2.putText(
            canvas,
            str(region.id),
            (cx - 6, cy + 6),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
            cv2.LINE_AA,
        )
    return canvas


def render_passage_candidates(
    gray: np.ndarray, regions: list[Region], candidates: list[PassageCandidate]
) -> np.ndarray:
    """Regions faint, each candidate overlap boxed with a link between the pair."""
    canvas = render_regions(gray, regions)
    by_id = {r.id: r for r in regions}
    for cand in candidates:
        cx, cy = int(cand.centroid[0]), int(cand.centroid[1])
        b = cand.bbox
        cv2.rectangle(canvas, (b.x, b.y), (b.x + b.w, b.y + b.h), (0, 0, 255), 2)
        cv2.circle(canvas, (cx, cy), 4, (0, 0, 255), -1)
        a, c = by_id.get(cand.region_ids[0]), by_id.get(cand.region_ids[1])
        if a and c:
            pa = (int(a.centroid[0]), int(a.centroid[1]))
            pc = (int(c.centroid[0]), int(c.centroid[1]))
            cv2.line(canvas, pa, pc, (0, 0, 255), 1, cv2.LINE_AA)
    return canvas


def render_graph(gray: np.ndarray, graph: ExtractedGraph) -> np.ndarray:
    """Plan (dimmed) with the bipartite graph superposed: rooms as circles,
    passages as red squares, bipartite edges as lines. Denormalizes coordinates."""
    base = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    canvas = cv2.addWeighted(base, 0.4, np.full_like(base, 255), 0.6, 0)
    h, w = gray.shape[:2]

    def px(pt: tuple[float, float]) -> tuple[int, int]:
        return (int(pt[0] * w), int(pt[1] * h))

    pos = {n.id: px(n.centroid) for n in graph.nodes}

    for edge in graph.edges:
        if edge.source in pos and edge.target in pos:
            cv2.line(canvas, pos[edge.source], pos[edge.target], (120, 120, 120), 1, cv2.LINE_AA)

    for node in graph.nodes:
        p = pos[node.id]
        if node.kind == "passage":
            cv2.rectangle(canvas, (p[0] - 5, p[1] - 5), (p[0] + 5, p[1] + 5), (0, 0, 255), -1)
            cv2.putText(canvas, node.type, (p[0] + 7, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
        else:
            cv2.circle(canvas, p, 6, (52, 152, 219), -1)
            if node.label:
                cv2.putText(canvas, node.label, (p[0] + 8, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (52, 100, 160), 1, cv2.LINE_AA)
    return canvas
