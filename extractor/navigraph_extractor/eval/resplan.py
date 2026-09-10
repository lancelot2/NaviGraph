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


def _transform(coords, minx, miny, scale, pad):
    return [((x - minx) * scale + pad, (y - miny) * scale + pad) for (x, y) in coords]


def plan_to_sample(
    plan: dict,
    name: str,
    target: int = 512,
    wall_px: int = 2,
    pad: int = 8,
    close_envelope: bool = True,
    envelope_px: int = 3,
) -> Optional[EvalSample]:
    """Map one ResPlan plan dict to an EvalSample (needs shapely/networkx objects).

    Coordinates are metres; we scale the combined node+wall extent to `target`
    and add `pad` px of margin so no room touches the image border (which would
    otherwise be rejected by Étape 2's border rule).
    """
    graph = plan.get("graph")
    if graph is None or graph.number_of_nodes() == 0:
        return None

    nodes = list(graph.nodes())
    index = {nid: i for i, nid in enumerate(nodes)}
    geoms = [graph.nodes[nid].get("geometry") for nid in nodes]

    wall = plan.get("wall")
    minx, miny, maxx, maxy = _bounds(geoms + ([wall] if wall is not None else []))
    span = max(maxx - minx, maxy - miny) or 1.0
    scale = (target - 2 * pad) / span
    h = max(1, round((maxy - miny) * scale) + 2 * pad)
    w = max(1, round((maxx - minx) * scale) + 2 * pad)

    gt_rooms: list[GtRoom] = []
    for nid in nodes:
        g = graph.nodes[nid].get("geometry")
        if g is None or not hasattr(g, "exterior"):
            gt_rooms.append(GtRoom(polygon=[], label=str(graph.nodes[nid].get("type", ""))))
            continue
        poly = _transform(list(g.exterior.coords), minx, miny, scale, pad)
        gt_rooms.append(GtRoom(polygon=poly, label=str(graph.nodes[nid].get("type", ""))))

    gt_edges: set[tuple[int, int]] = set()
    for u, v, data in graph.edges(data=True):
        if data.get("type") in OPENING_EDGE_TYPES:
            a, b = index[u], index[v]
            gt_edges.add((min(a, b), max(a, b)))

    # Rasterize walls (fallback to room outlines when no wall geometry present).
    gray = np.full((h, w), 255, dtype=np.uint8)
    drawn = _draw_geometry(gray, wall, minx, miny, scale, pad, wall_px)
    if not drawn:
        for room in gt_rooms:
            if len(room.polygon) >= 3:
                pts = np.array([[round(x), round(y)] for (x, y) in room.polygon], np.int32)
                cv2.polylines(gray, [pts], True, 0, wall_px)

    # Close the building envelope: the raw wall geometry has an open perimeter
    # (doors, drawing gaps), so the interior would leak to the exterior. Draw the
    # footprint boundary (union of rooms) as an outer wall. This is the exterior
    # wall only — it does not reveal interior partitions.
    if close_envelope:
        _draw_footprint_boundary(gray, geoms, minx, miny, scale, pad, envelope_px)

    return EvalSample(name=name, gray=gray, gt_rooms=gt_rooms, gt_edges=gt_edges)


def _draw_footprint_boundary(gray, geoms, minx, miny, scale, pad, thickness: int) -> None:
    from shapely.ops import unary_union

    valid = [g for g in geoms if g is not None and not g.is_empty]
    if not valid:
        return
    footprint = unary_union(valid)
    for poly in getattr(footprint, "geoms", [footprint]):
        ring = getattr(poly, "exterior", None)
        if ring is None:
            continue
        pts = np.array(
            [[round(x), round(y)] for (x, y) in _transform(list(ring.coords), minx, miny, scale, pad)],
            np.int32,
        )
        cv2.polylines(gray, [pts], True, 0, thickness)


def _draw_geometry(gray, geom, minx, miny, scale, pad, wall_px: int) -> bool:
    """Draw shapely wall geometry as black. Polygons are FILLED (ResPlan walls are
    solid MultiPolygons); LineStrings are stroked. Returns whether anything drawn."""
    if geom is None or geom.is_empty:
        return False
    parts = list(getattr(geom, "geoms", [geom]))
    drawn = False
    for part in parts:
        if hasattr(part, "exterior"):  # Polygon -> fill the wall area
            pts = np.array(
                [[round(x), round(y)] for (x, y) in _transform(list(part.exterior.coords), minx, miny, scale, pad)],
                np.int32,
            )
            cv2.fillPoly(gray, [pts], 0)
            drawn = True
        elif hasattr(part, "coords"):  # LineString -> stroke
            pts = np.array(
                [[round(x), round(y)] for (x, y) in _transform(list(part.coords), minx, miny, scale, pad)],
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
