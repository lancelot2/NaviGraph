"""Étape 1 — preprocessing (pure, offline).

Turns a resolution-normalized grayscale plan into a clean binary of the
structural strokes (walls), plus the complementary free-space mask that Étape 2
segments. Thin strokes (dimension lines, hatching) and, optionally, text /
furniture glyphs are removed so they don't create parasitic closed regions
downstream.

All functions are pure numpy/OpenCV and take an :class:`ExtractorParams`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import cv2
import numpy as np

from .config import ExtractorParams

# An optional OCR hook: given the grayscale image, return bounding boxes
# (x, y, w, h) of text to mask. Not required; wired but never mandatory.
OcrHook = Callable[[np.ndarray], list[tuple[int, int, int, int]]]


@dataclass(frozen=True)
class PreprocessResult:
    """Binary products of preprocessing (all uint8, 0/255)."""

    gray: np.ndarray  # the working grayscale image
    walls: np.ndarray  # structural strokes, foreground = 255
    free: np.ndarray  # complement of walls (free space), foreground = 255
    text_mask: Optional[np.ndarray]  # what text-removal masked out, or None


def binarize(gray: np.ndarray, params: ExtractorParams) -> np.ndarray:
    """Binarize so walls (dark strokes) become foreground (255)."""
    if params.binarization == "otsu":
        _, walls = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
        return walls
    # adaptive
    block = params.adaptive_block_size
    if block % 2 == 0:
        block += 1  # OpenCV requires an odd block size
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block,
        params.adaptive_c,
    )


def suppress_thin_lines(walls: np.ndarray, ksize: int) -> np.ndarray:
    """Morphological opening to drop strokes thinner than `ksize` px. No-op if 0."""
    if ksize <= 0:
        return walls
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    return cv2.morphologyEx(walls, cv2.MORPH_OPEN, kernel)


def remove_text_furniture(
    walls: np.ndarray,
    params: ExtractorParams,
    ocr_hook: Optional[OcrHook] = None,
    gray: Optional[np.ndarray] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Mask out small, dense connected components (text / furniture glyphs).

    A component is removed when it is both small (area <= text_max_area_pct of the
    image) and dense (filled fraction of its bbox >= text_min_fill). Returns the
    cleaned walls and the removed mask. An optional OCR hook can add boxes to mask.
    """
    h, w = walls.shape[:2]
    total_area = float(h * w)
    max_area = (params.text_max_area_pct / 100.0) * total_area

    num, labels, stats, _ = cv2.connectedComponentsWithStats(walls, connectivity=8)
    removal = np.zeros_like(walls)
    for label in range(1, num):
        area = float(stats[label, cv2.CC_STAT_AREA])
        bw = float(stats[label, cv2.CC_STAT_WIDTH])
        bh = float(stats[label, cv2.CC_STAT_HEIGHT])
        fill = area / (bw * bh) if bw > 0 and bh > 0 else 0.0
        if area <= max_area and fill >= params.text_min_fill:
            removal[labels == label] = 255

    if ocr_hook is not None and gray is not None:
        for x, y, bw_, bh_ in ocr_hook(gray):
            removal[y : y + bh_, x : x + bw_] = 255

    cleaned = cv2.bitwise_and(walls, cv2.bitwise_not(removal))
    return cleaned, removal


def preprocess(
    gray: np.ndarray,
    params: ExtractorParams,
    ocr_hook: Optional[OcrHook] = None,
) -> PreprocessResult:
    """Run the full preprocessing chain on a normalized grayscale image."""
    walls = binarize(gray, params)
    walls = suppress_thin_lines(walls, params.thin_line_open_ksize)

    text_mask: Optional[np.ndarray] = None
    if params.remove_text:
        walls, text_mask = remove_text_furniture(walls, params, ocr_hook, gray)

    free = cv2.bitwise_not(walls)
    return PreprocessResult(gray=gray, walls=walls, free=free, text_mask=text_mask)
