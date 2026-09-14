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

from typing import Optional

from .config import ExtractorParams
from .passages import estimate_wall_thickness
from .schema import BBox, Region


def _touches_border(x: int, y: int, w: int, h: int, W: int, H: int) -> bool:
    return x <= 0 or y <= 0 or (x + w) >= W or (y + h) >= H


def _cluster_snap(values: list[int], tol: int) -> dict[int, int]:
    """Map each value to the mean of its cluster (values within `tol` of a chain)."""
    order = sorted(set(values))
    clusters: list[list[int]] = [[order[0]]]
    for v in order[1:]:
        if v - clusters[-1][-1] <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    mapping: dict[int, int] = {}
    for cluster in clusters:
        rep = int(round(sum(cluster) / len(cluster)))
        for v in cluster:
            mapping[v] = rep
    return mapping


def rectilinearize(polygon: list[tuple[int, int]], tol: int = 3) -> list[tuple[int, int]]:
    """Snap near-collinear vertex coordinates together so axis-aligned walls
    become exactly straight. Leaves genuinely diagonal edges alone."""
    if len(polygon) < 3:
        return polygon
    xmap = _cluster_snap([x for x, _ in polygon], tol)
    ymap = _cluster_snap([y for _, y in polygon], tol)
    snapped = [(xmap[x], ymap[y]) for x, y in polygon]
    out: list[tuple[int, int]] = []
    for p in snapped:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def extract_regions(
    free: np.ndarray,
    params: ExtractorParams,
    wall_mask: Optional[np.ndarray] = None,
) -> list[Region]:
    """Extract closed free-space regions from a binary free-space mask.

    `free` is uint8 with free space as foreground (255), as produced by
    :func:`preprocess`. `wall_mask`, if given, lets region polygons be grown to
    the wall centerline. Returns regions with re-indexed ids 0..n-1.
    """
    H, W = free.shape[:2]
    total = float(H * W)
    min_area = (params.min_region_area_pct / 100.0) * total

    snap_px = 0
    if params.snap_to_walls and wall_mask is not None:
        snap_px = max(0, round(estimate_wall_thickness(wall_mask) / 2.0))

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
        if snap_px > 0:  # grow to the wall centerline
            kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (2 * snap_px + 1, 2 * snap_px + 1)
            )
            mask = cv2.dilate(mask, kernel)
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        epsilon = params.approx_epsilon_frac * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        polygon = [(int(pt[0][0]), int(pt[0][1])) for pt in approx]
        if params.rectilinear:
            polygon = rectilinearize(polygon)

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
