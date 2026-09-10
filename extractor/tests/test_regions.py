"""Étape 2 region extraction tests — synthetic free-space masks, offline."""

from __future__ import annotations

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.regions import extract_regions


def _free_with_two_rooms_and_exterior() -> np.ndarray:
    """Black background; two interior rooms + an exterior blob touching the border."""
    free = np.zeros((600, 800), dtype=np.uint8)
    cv2.rectangle(free, (100, 100), (300, 300), 255, thickness=-1)  # room A
    cv2.rectangle(free, (450, 100), (650, 300), 255, thickness=-1)  # room B
    cv2.rectangle(free, (0, 0), (40, 599), 255, thickness=-1)  # exterior (touches border)
    return free


def test_extracts_interior_rooms_and_drops_exterior():
    free = _free_with_two_rooms_and_exterior()
    regions = extract_regions(free, ExtractorParams(min_region_area_pct=0.1))

    assert len(regions) == 2  # exterior discarded by the border rule
    centroids = sorted(r.centroid[0] for r in regions)
    assert abs(centroids[0] - 200) < 3
    assert abs(centroids[1] - 550) < 3
    for r in regions:
        assert r.area > 30000  # ~200x200
        assert len(r.polygon) == 4  # a rectangle simplifies to 4 corners


def test_border_touching_component_is_rejected():
    free = np.zeros((400, 400), dtype=np.uint8)
    cv2.rectangle(free, (0, 0), (200, 200), 255, thickness=-1)  # touches top-left border
    regions = extract_regions(free, ExtractorParams(min_region_area_pct=0.01))
    assert regions == []


def test_min_area_filter_drops_small_regions():
    free = np.zeros((600, 800), dtype=np.uint8)
    cv2.rectangle(free, (100, 100), (300, 300), 255, thickness=-1)  # big room
    cv2.rectangle(free, (400, 400), (420, 420), 255, thickness=-1)  # tiny 20x20

    total = 600 * 800
    # min area between the tiny (400px) and big (~40k px): 0.1% == 480px.
    regions = extract_regions(free, ExtractorParams(min_region_area_pct=0.1))
    assert len(regions) == 1
    assert regions[0].area > 30000

    # Lower the threshold below the tiny region and it reappears.
    regions_all = extract_regions(free, ExtractorParams(min_region_area_pct=0.01))
    assert len(regions_all) == 2


def test_region_ids_are_reindexed_from_zero():
    free = _free_with_two_rooms_and_exterior()
    regions = extract_regions(free, ExtractorParams(min_region_area_pct=0.1))
    assert sorted(r.id for r in regions) == [0, 1]
