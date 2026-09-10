"""Étape 3 passage detection tests — synthetic regions, offline/deterministic."""

from __future__ import annotations

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.passages import (
    detect_passages,
    effective_k,
    estimate_wall_thickness,
    resolve_dilation_k,
)
from navigraph_extractor.schema import BBox, Region


def _rect_region(rid: int, x0: int, y0: int, x1: int, y1: int) -> Region:
    poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    return Region(
        id=rid,
        polygon=poly,
        area=(x1 - x0) * (y1 - y0),
        centroid=((x0 + x1) / 2, (y0 + y1) / 2),
        bbox=BBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0),
    )


SHAPE = (512, 640)  # H, W


def test_k_derivation_matches_paper_at_512():
    assert resolve_dilation_k(ExtractorParams(), 512) == 5
    assert resolve_dilation_k(ExtractorParams(passage_dilation_k=9), 512) == 9
    # Larger unnormalized image scales k up (and stays odd).
    assert resolve_dilation_k(ExtractorParams(), 1024) == 11


def test_effective_k_from_measured_wall_thickness():
    wall = np.zeros((200, 200), dtype=np.uint8)
    cv2.rectangle(wall, (50, 50), (150, 150), 255, 6)  # ~6px-thick wall
    thickness = estimate_wall_thickness(wall)
    assert 3.0 <= thickness <= 10.0

    k = effective_k(ExtractorParams(passage_k_from_walls=True), (200, 200), wall)
    assert k >= 5 and k % 2 == 1

    # Without the flag it falls back to the resolution rule (5 @ 512).
    assert effective_k(ExtractorParams(), (512, 512), wall) == 5


def test_close_regions_produce_one_candidate():
    a = _rect_region(0, 100, 100, 300, 300)
    b = _rect_region(1, 303, 100, 500, 300)  # ~2px gap, bridged by k=5 (radius 2)
    cands = detect_passages([a, b], SHAPE, ExtractorParams(passage_dilation_k=5))
    assert len(cands) == 1
    assert cands[0].region_ids == (0, 1)
    # Overlap sits in the gap between the two rooms.
    assert 295 <= cands[0].centroid[0] <= 308


def test_far_regions_produce_no_candidate():
    a = _rect_region(0, 100, 100, 300, 300)
    b = _rect_region(1, 340, 100, 540, 300)  # 40px gap, beyond dilation reach
    cands = detect_passages([a, b], SHAPE, ExtractorParams(passage_dilation_k=5))
    assert cands == []


def test_chain_yields_only_adjacent_pairs():
    a = _rect_region(0, 40, 100, 200, 300)
    b = _rect_region(1, 203, 100, 360, 300)  # ~2px from A
    c = _rect_region(2, 363, 100, 520, 300)  # ~2px from B, far from A
    cands = detect_passages([a, b, c], SHAPE, ExtractorParams(passage_dilation_k=5))
    pairs = sorted(c.region_ids for c in cands)
    assert pairs == [(0, 1), (1, 2)]


def test_thumbnail_present_only_with_source():
    a = _rect_region(0, 100, 100, 300, 300)
    b = _rect_region(1, 303, 100, 500, 300)
    params = ExtractorParams(passage_dilation_k=5, vignette_margin_px=10)

    no_src = detect_passages([a, b], SHAPE, params)
    assert no_src[0].thumbnail is None

    source = np.full(SHAPE, 200, dtype=np.uint8)
    with_src = detect_passages([a, b], SHAPE, params, source=source)
    thumb = with_src[0].thumbnail
    assert thumb is not None and thumb.size > 0
