"""Pixel-perfect room colouring (pure OpenCV, no ML, no LLM).

Fills each walled room region with a distinct semi-transparent pastel, up to the
wall lines — the "coloured layers" visualisation. Deterministic and fast (~1s).

Limitation: open-plan areas with no wall between them fill as a SINGLE region
(flood fill cannot separate what is not walled). That is accepted by design.
"""

from __future__ import annotations

from typing import Optional, Sequence

import cv2
import numpy as np

# Semi-transparent pastel palette (BGR), cycled across detected regions.
_PALETTE = [
    (200, 180, 255), (180, 255, 200), (255, 220, 180), (180, 220, 255),
    (255, 200, 230), (200, 255, 255), (220, 200, 255), (255, 255, 190),
    (200, 230, 255), (230, 255, 200), (210, 210, 255), (255, 230, 210),
]

# A polygon is a sequence of normalized [0,1] (x, y) points.
Polygon = Sequence[tuple[float, float]]


def colorize_plan(
    image_bytes: bytes,
    wall_dilate: int = 13,
    min_area_pct: float = 0.25,
    alpha: float = 0.5,
    polygons: Optional[Sequence[Polygon]] = None,
) -> bytes:
    """Plan image bytes -> PNG bytes with rooms coloured up to the walls.

    - wall_dilate: kernel (px) to thicken walls so open doorways close and rooms
      stay separate. Larger = fewer, cleaner regions (but merges more).
    - min_area_pct: drop regions smaller than this % of the image (text/furniture).
    - alpha: overlay opacity.
    - polygons: user-drawn rooms (normalized [0,1] outlines) to paint as coloured
      regions on top of the flood-fill, so a room traced by hand on the plan shows
      up on the coloured overlay even where no wall bounds it.
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode image")
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Adaptive threshold: handles light-grey walls that Otsu misses.
    walls = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 35, 10
    )
    if wall_dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (wall_dilate, wall_dilate))
        walls = cv2.dilate(walls, k, iterations=1)

    space = (walls == 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(space, connectivity=4)

    overlay = img.copy()
    min_area = min_area_pct / 100.0 * (H * W)
    kept = 0
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        # Drop the building exterior (its component touches the image border).
        if x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1:
            continue
        overlay[labels == i] = _PALETTE[kept % len(_PALETTE)]
        kept += 1

    # Paint hand-drawn rooms on top, continuing the palette so they stay distinct.
    for poly in polygons or []:
        pts = _to_pixels(poly, W, H)
        if pts is None:
            continue
        color = _PALETTE[kept % len(_PALETTE)]
        cv2.fillPoly(overlay, [pts], color)
        kept += 1

    out = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)

    # Outline the hand-drawn rooms on the blended result so their edge reads
    # crisply (the semi-transparent fill alone can be faint over busy plans).
    for poly in polygons or []:
        pts = _to_pixels(poly, W, H)
        if pts is not None:
            cv2.polylines(out, [pts], isClosed=True, color=(60, 60, 60), thickness=2)

    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise ValueError("could not encode PNG")
    return buf.tobytes()


def _to_pixels(poly: Polygon, W: int, H: int) -> Optional[np.ndarray]:
    """Normalized [0,1] outline -> int32 pixel points, or None if degenerate."""
    if not poly or len(poly) < 3:
        return None
    pts = np.array(
        [(round(float(x) * W), round(float(y) * H)) for x, y in poly],
        dtype=np.int32,
    )
    return pts.reshape((-1, 1, 2))
