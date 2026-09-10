"""Unit tests for the georeference math (no ROS required)."""

from __future__ import annotations

import math
from pathlib import Path

from navigraph import load_bundle

from navigraph_ros.geo import map_point, node_centroid_normalized, plan_to_map_points

SAMPLE = Path(__file__).resolve().parent.parent / "examples" / "sample_building.navigraph.json"


def test_map_point_identity():
    georef = {"image_width": 100, "image_height": 100, "resolution": 0.1, "origin": {"x": 0.0, "y": 0.0, "theta": 0.0}}
    x, y = map_point(georef, 0.5, 0.5)
    assert math.isclose(x, 5.0)
    assert math.isclose(y, 5.0)


def test_map_point_with_origin_and_rotation():
    georef = {"image_width": 100, "image_height": 100, "resolution": 0.1, "origin": {"x": 10.0, "y": -2.0, "theta": math.pi / 2}}
    x, y = map_point(georef, 0.5, 0.0)  # mx = 5, my = 0
    assert math.isclose(x, 10.0, abs_tol=1e-9)
    assert math.isclose(y, 3.0, abs_tol=1e-9)  # -2 + 5


def test_node_centroid_prefers_points_over_bounds():
    node = type("N", (), {"metadata": {"points": [{"x": 0.0, "y": 0.0}, {"x": 0.4, "y": 0.2}]}})()
    assert node_centroid_normalized(node) == (0.2, 0.1)


def test_plan_to_map_points_from_sample_bundle():
    bundle = load_bundle(SAMPLE)
    pts = plan_to_map_points(bundle, ["Lobby", "Corridor"])
    assert pts is not None
    assert len(pts) == 2
    # Lobby centroid (0.25, 0.50) -> px (250, 400) -> m (12.5, 20.0)
    assert math.isclose(pts[0][0], 12.5, abs_tol=1e-6)
    assert math.isclose(pts[0][1], 20.0, abs_tol=1e-6)


def test_plan_to_map_points_none_without_georeference():
    bundle = load_bundle(SAMPLE)
    stripped = bundle.__class__(
        schema_version=bundle.schema_version,
        project=bundle.project,
        graph=bundle.graph,
        embedding=bundle.embedding,
        references=bundle.references,
        georeference=None,
    )
    assert plan_to_map_points(stripped, ["Lobby", "Corridor"]) is None
