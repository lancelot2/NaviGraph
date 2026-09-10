"""Étape 2 — region extraction (pure, deterministic, zero LLM).

Segments the free-space mask into closed regions (rooms / usable spaces) via
connected components, then extracts a simplified boundary polygon for each.

The two rejection rules are load-bearing:
  * components touching the image border are dropped — this removes the building
    exterior (the single largest free-space blob), and must not be skipped;
  * components below a minimum area (as a fraction of the whole image) are dropped.
"""

from __future__ import annotations

import cv2
import numpy as np

from .config import ExtractorParams
from .schema import BBox, Region


def _touches_border(x: int, y: int, w: int, h: int, W: int, H: int) -> bool:
    return x <= 0 or y <= 0 or (x + w) >= W or (y + h) >= H


def extract_regions(free: np.ndarray, params: ExtractorParams) -> list[Region]:
    """Extract closed free-space regions from a binary free-space mask.

    `free` is uint8 with free space as foreground (255), as produced by
    :func:`preprocess`. Returns regions with re-indexed ids 0..n-1, ordered by
    connected-component label.
    """
    H, W = free.shape[:2]
    total = float(H * W)
    min_area = (params.min_region_area_pct / 100.0) * total

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(
        free, connectivity=8
    )

    regions: list[Region] = []
    next_id = 0
    for label in range(1, num):  # 0 is background (the walls)
        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        w = int(stats[label, cv2.CC_STAT_WIDTH])
        h = int(stats[label, cv2.CC_STAT_HEIGHT])
        area = int(stats[label, cv2.CC_STAT_AREA])

        if _touches_border(x, y, w, h, W, H):
            continue  # building exterior / open drawing edges
        if area < min_area:
            continue

        mask = (labels == label).astype(np.uint8) * 255
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        epsilon = params.approx_epsilon_frac * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        polygon = [(int(pt[0][0]), int(pt[0][1])) for pt in approx]

        cx, cy = centroids[label]
        regions.append(
            Region(
                id=next_id,
                polygon=polygon,
                area=area,
                centroid=(float(cx), float(cy)),
                bbox=BBox(x=x, y=y, w=w, h=h),
            )
        )
        next_id += 1

    return regions
