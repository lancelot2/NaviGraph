"""ResPlan loader adapter (github.com/m-agour/ResPlan).

ResPlan ships a pickle of plan dicts. Geometry is Shapely; `plan["graph"]` is a
NetworkX graph whose nodes carry `geometry` (room polygon) and `type` (17-class
label), and whose edges carry `type` in {via_door, via_window, via_opening,
direct, adjacency, fallback}. The *traversable* ground truth is the opening
subset (door/window/opening).

Requires the eval extra (`pip install -e ".[eval]"` -> shapely, networkx) and the
downloaded ResPlan pickle. This adapter maps each plan to an EvalSample:
GT rooms/edges come straight from plan["graph"]; the input image is rasterized
from the wall geometry.

NOTE: the wall rasterization (target scaling, wall thickness) is the one part
that must be validated against the real dataset / resplan_utils.py; it is kept
isolated here so tuning it does not touch the metrics.
"""

from __future__ import annotations

import pickle
from typing import Any, Iterator, Optional

import cv2
import numpy as np

from .sample import EvalSample, GtRoom

OPENING_EDGE_TYPES = {"via_door", "via_window", "via_opening"}


def _bounds(geoms: list[Any]) -> tuple[float, float, float, float]:
    xs0, ys0, xs1, ys1 = [], [], [], []
    for g in geoms:
        if g is None:
            continue
        minx, miny, maxx, maxy = g.bounds  # shapely
        xs0.append(minx)
        ys0.append(miny)
        xs1.append(maxx)
        ys1.append(maxy)
    return min(xs0), min(ys0), max(xs1), max(ys1)


def _transform(coords, minx, miny, scale):
    return [((x - minx) * scale, (y - miny) * scale) for (x, y) in coords]


def plan_to_sample(
    plan: dict, name: str, target: int = 512, wall_px: int = 2
) -> Optional[EvalSample]:
    """Map one ResPlan plan dict to an EvalSample (needs shapely/networkx objects)."""
    graph = plan.get("graph")
    if graph is None or graph.number_of_nodes() == 0:
        return None

    nodes = list(graph.nodes())
    index = {nid: i for i, nid in enumerate(nodes)}
    geoms = [graph.nodes[nid].get("geometry") for nid in nodes]

    minx, miny, maxx, maxy = _bounds(geoms)
    span = max(maxx - minx, maxy - miny) or 1.0
    scale = target / span
    h = max(1, round((maxy - miny) * scale))
    w = max(1, round((maxx - minx) * scale))

    gt_rooms: list[GtRoom] = []
    for nid in nodes:
        g = graph.nodes[nid].get("geometry")
        if g is None or not hasattr(g, "exterior"):
            gt_rooms.append(GtRoom(polygon=[], label=str(graph.nodes[nid].get("type", ""))))
            continue
        poly = _transform(list(g.exterior.coords), minx, miny, scale)
        gt_rooms.append(GtRoom(polygon=poly, label=str(graph.nodes[nid].get("type", ""))))

    gt_edges: set[tuple[int, int]] = set()
    for u, v, data in graph.edges(data=True):
        if data.get("type") in OPENING_EDGE_TYPES:
            a, b = index[u], index[v]
            gt_edges.add((min(a, b), max(a, b)))

    # Rasterize walls (fallback to room outlines when no wall geometry present).
    gray = np.full((h, w), 255, dtype=np.uint8)
    walls = plan.get("wall")
    drawn = _draw_geometry(gray, walls, minx, miny, scale, wall_px)
    if not drawn:
        for room in gt_rooms:
            if len(room.polygon) >= 3:
                pts = np.array([[round(x), round(y)] for (x, y) in room.polygon], np.int32)
                cv2.polylines(gray, [pts], True, 0, wall_px)

    return EvalSample(name=name, gray=gray, gt_rooms=gt_rooms, gt_edges=gt_edges)


def _draw_geometry(gray, geom, minx, miny, scale, wall_px: int) -> bool:
    """Draw shapely wall geometry (Line/Polygon/Multi*) as black strokes. Returns
    whether anything was drawn."""
    if geom is None:
        return False
    parts = list(getattr(geom, "geoms", [geom]))
    drawn = False
    for part in parts:
        coords = None
        if hasattr(part, "exterior"):
            coords = list(part.exterior.coords)
        elif hasattr(part, "coords"):
            coords = list(part.coords)
        if not coords:
            continue
        pts = np.array(
            [[round(x), round(y)] for (x, y) in _transform(coords, minx, miny, scale)],
            np.int32,
        )
        cv2.polylines(gray, [pts], False, 0, wall_px)
        drawn = True
    return drawn


def load_samples(path: str, n: Optional[int] = None, target: int = 512) -> Iterator[EvalSample]:
    """Yield EvalSamples from a ResPlan pickle (first `n` plans, or all)."""
    with open(path, "rb") as fh:
        data = pickle.load(fh)
    plans = data if n is None else data[:n]
    for i, plan in enumerate(plans):
        sample = plan_to_sample(plan, name=f"resplan-{i}", target=target)
        if sample is not None:
            yield sample
