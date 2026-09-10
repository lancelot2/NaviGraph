"""Pure georeference math — mapping a topological plan into a metric map frame.

Kept free of any ROS import so it can be unit-tested with plain Python. The node
turns the (x, y) points this produces into a ``nav_msgs/Path``.

A bundle only yields a metric path when it carries a ``georeference`` (see
docs/spatial-graph-format.md) and every node on the route has a plan outline
(``metadata.points`` or ``metadata.bounds``). Otherwise the graph is
topological-only and no Path is emitted.
"""

from __future__ import annotations

import math
from typing import Optional

from navigraph.bundle import Bundle
from navigraph.core import node_name
from navigraph.types import GraphNode


def node_centroid_normalized(node: GraphNode) -> Optional[tuple[float, float]]:
    """Centroid of a node's plan outline in normalized [0,1] image coordinates."""
    meta = node.metadata
    points = meta.get("points")
    if points:
        xs = [p["x"] for p in points]
        ys = [p["y"] for p in points]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    bounds = meta.get("bounds")
    if bounds:
        return (bounds["x"] + bounds["w"] / 2.0, bounds["y"] + bounds["h"] / 2.0)
    return None


def map_point(georef: dict, nx: float, ny: float) -> tuple[float, float]:
    """Map a normalized [0,1] plan point into the georeference's map frame."""
    px = nx * georef["image_width"]
    py = ny * georef["image_height"]
    mx = px * georef["resolution"]
    my = py * georef["resolution"]

    origin = georef["origin"]
    theta = origin.get("theta", 0.0)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    x = origin["x"] + mx * cos_t - my * sin_t
    y = origin["y"] + mx * sin_t + my * cos_t
    return (x, y)


def plan_to_map_points(
    bundle: Bundle, path_names: list[str]
) -> Optional[list[tuple[float, float]]]:
    """Metric waypoints for a planned route, or None if the graph is not georeferenced.

    Returns None when the bundle has no ``georeference`` or any node on the route
    lacks a plan outline — the caller then skips Path publication.
    """
    georef = bundle.georeference
    if not georef:
        return None

    # Resolve display names back to nodes (the planner returns node names).
    by_name: dict[str, GraphNode] = {}
    for n in bundle.graph.nodes:
        by_name.setdefault(node_name(n), n)

    points: list[tuple[float, float]] = []
    for name in path_names:
        node = by_name.get(name)
        if node is None:
            return None
        centroid = node_centroid_normalized(node)
        if centroid is None:
            return None
        points.append(map_point(georef, centroid[0], centroid[1]))
    return points
