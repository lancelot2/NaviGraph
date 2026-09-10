"""Étape 3 — passage candidate detection (pure, parallelizable).

Doors and windows are ruptures in the walls, not closed regions, so they never
come out of Étape 2. They are found geometrically: dilate each region by a
kernel `k` and where two dilated regions overlap, there is a candidate passage
between them. Each region is handled independently (embarrassingly parallel);
the overlap centroid becomes the crossing waypoint and its neighborhood the
thumbnail sent to the labeler.

No LLM, no network.
"""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from .config import ExtractorParams
from .schema import BBox, PassageCandidate, Region


def _odd(k: int) -> int:
    k = max(3, k)
    return k + 1 if k % 2 == 0 else k


def resolve_dilation_k(params: ExtractorParams, long_side: int) -> int:
    """Kernel size: explicit if set, else derived from resolution (5 @ 512px).

    Forced odd and >= 3 for a symmetric structuring element.
    """
    if params.passage_dilation_k > 0:
        return _odd(params.passage_dilation_k)
    return _odd(round(5 * long_side / 512))


def estimate_wall_thickness(wall_mask: np.ndarray) -> float:
    """Estimate the typical wall stroke thickness (px) from a distance transform.

    2·median(DT over wall pixels) ≈ the width of a uniform strip.
    """
    dt = cv2.distanceTransform(wall_mask, cv2.DIST_L2, 3)
    vals = dt[wall_mask > 0]
    if vals.size == 0:
        return 0.0
    return float(2.0 * np.median(vals))


def effective_k(
    params: ExtractorParams,
    shape: tuple[int, int],
    wall_mask: Optional[np.ndarray] = None,
) -> int:
    """The dilation k actually used: explicit > from-wall-thickness > resolution."""
    if params.passage_dilation_k > 0:
        return _odd(params.passage_dilation_k)
    if params.passage_k_from_walls and wall_mask is not None:
        thickness = estimate_wall_thickness(wall_mask)
        # Each of two regions dilates by ~k/2; to bridge a wall of width `thickness`
        # we need k >= thickness, with margin for robustness.
        return _odd(max(5, round(thickness) + 3))
    return resolve_dilation_k(params, max(shape))


def _rasterize(region: Region, shape: tuple[int, int]) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    pts = np.array(region.polygon, dtype=np.int32).reshape(-1, 1, 2)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _expanded_bbox_intersect(a: BBox, b: BBox, pad: int) -> bool:
    ax0, ay0, ax1, ay1 = a.x - pad, a.y - pad, a.x + a.w + pad, a.y + a.h + pad
    bx0, by0, bx1, by1 = b.x - pad, b.y - pad, b.x + b.w + pad, b.y + b.h + pad
    return not (ax1 < bx0 or bx1 < ax0 or ay1 < by0 or by1 < ay0)


def _crop_thumbnail(
    source: np.ndarray, bbox: BBox, margin: int
) -> np.ndarray:
    h, w = source.shape[:2]
    x0 = max(0, bbox.x - margin)
    y0 = max(0, bbox.y - margin)
    x1 = min(w, bbox.x + bbox.w + margin)
    y1 = min(h, bbox.y + bbox.h + margin)
    return source[y0:y1, x0:x1].copy()


def detect_passages(
    regions: list[Region],
    shape: tuple[int, int],
    params: ExtractorParams,
    source: Optional[np.ndarray] = None,
    wall_mask: Optional[np.ndarray] = None,
) -> list[PassageCandidate]:
    """Find candidate passages between regions by dilated-mask overlap.

    `shape` is (H, W) of the working image (used to size masks and derive k).
    `source`, if given, is the image the thumbnails are cropped from.
    `wall_mask`, if given, lets k be derived from the measured wall thickness.
    """
    H, W = shape
    k = effective_k(params, shape, wall_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))

    dilated: dict[int, np.ndarray] = {}
    for region in regions:
        dilated[region.id] = cv2.dilate(_rasterize(region, (H, W)), kernel)

    candidates: list[PassageCandidate] = []
    next_id = 0
    for i in range(len(regions)):
        for j in range(i + 1, len(regions)):
            ra, rb = regions[i], regions[j]
            # Quick reject: dilated bboxes can't overlap -> skip the AND.
            if not _expanded_bbox_intersect(ra.bbox, rb.bbox, k):
                continue
            overlap = cv2.bitwise_and(dilated[ra.id], dilated[rb.id])
            ys, xs = np.nonzero(overlap)
            if xs.size == 0:
                continue

            x0, x1 = int(xs.min()), int(xs.max())
            y0, y1 = int(ys.min()), int(ys.max())
            bbox = BBox(x=x0, y=y0, w=x1 - x0 + 1, h=y1 - y0 + 1)
            centroid = (float(xs.mean()), float(ys.mean()))
            thumb = (
                _crop_thumbnail(source, bbox, params.vignette_margin_px)
                if source is not None
                else None
            )
            pair = (ra.id, rb.id) if ra.id < rb.id else (rb.id, ra.id)
            candidates.append(
                PassageCandidate(
                    id=next_id,
                    region_ids=pair,
                    bbox=bbox,
                    centroid=centroid,
                    thumbnail=thumb,
                )
            )
            next_id += 1

    return candidates
