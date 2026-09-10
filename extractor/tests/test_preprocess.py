"""Étape 1 preprocessing tests — synthetic images, fully deterministic/offline."""

from __future__ import annotations

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.image_io import normalize_resolution
from navigraph_extractor.preprocess import (
    binarize,
    preprocess,
    remove_text_furniture,
)


def _blank(h: int = 600, w: int = 800) -> np.ndarray:
    """White (255) grayscale canvas."""
    return np.full((h, w), 255, dtype=np.uint8)


def test_normalize_resolution_scales_long_side_to_target():
    gray = _blank(768, 1024)  # long side 1024
    resized, scale = normalize_resolution(gray, 512)
    assert scale == 512 / 1024
    assert resized.shape == (384, 512)  # (h, w)


def test_normalize_resolution_leaves_small_images_untouched():
    gray = _blank(300, 400)
    resized, scale = normalize_resolution(gray, 512)
    assert scale == 1.0
    assert resized.shape == (300, 400)


def test_binarize_otsu_makes_walls_foreground():
    gray = _blank()
    cv2.rectangle(gray, (100, 100), (500, 400), color=0, thickness=3)  # dark wall
    walls = binarize(gray, ExtractorParams(binarization="otsu"))

    assert walls.dtype == np.uint8
    assert set(np.unique(walls)).issubset({0, 255})
    assert walls[100, 300] == 255  # a point on the top wall -> foreground
    assert walls[250, 300] == 0  # room interior -> background


def test_binarize_adaptive_returns_binary():
    gray = _blank()
    cv2.rectangle(gray, (100, 100), (500, 400), color=0, thickness=3)
    walls = binarize(gray, ExtractorParams(binarization="adaptive"))
    assert walls.dtype == np.uint8
    assert set(np.unique(walls)).issubset({0, 255})


def test_remove_text_furniture_masks_small_dense_blob_but_keeps_walls():
    gray = _blank()
    cv2.rectangle(gray, (100, 100), (500, 400), color=0, thickness=3)  # thin outline
    cv2.rectangle(gray, (250, 240), (262, 252), color=0, thickness=-1)  # filled 12x12 glyph

    walls = binarize(gray, ExtractorParams(binarization="otsu"))
    cleaned, removed = remove_text_furniture(
        walls, ExtractorParams(remove_text=True, text_max_area_pct=0.2, text_min_fill=0.5)
    )

    # The dense glyph is removed...
    assert removed[246, 256] == 255
    assert cleaned[246, 256] == 0
    # ...while the thin wall outline (low fill) survives.
    assert cleaned[100, 300] == 255


def _two_rooms_with_doorway() -> np.ndarray:
    """Building outline + a vertical divider with a ~9px gap (a doorway)."""
    img = _blank(512, 512)
    cv2.rectangle(img, (50, 50), (462, 462), 0, 3)
    cv2.line(img, (256, 50), (256, 240), 0, 3)  # divider top
    cv2.line(img, (256, 250), (256, 462), 0, 3)  # divider bottom, gap 240..250
    return img


def test_wall_sealing_splits_rooms_merged_by_a_doorway():
    from navigraph_extractor.regions import extract_regions

    gray = _two_rooms_with_doorway()

    # Without sealing, free space leaks through the doorway -> the two rooms
    # merge into a single component.
    merged = extract_regions(preprocess(gray, ExtractorParams()).free, ExtractorParams())
    assert len(merged) == 1

    # Sealing the gap restores two separate rooms.
    sealed = preprocess(gray, ExtractorParams(wall_close_ksize=15)).free
    assert len(extract_regions(sealed, ExtractorParams())) == 2


def test_preprocess_free_is_complement_of_walls():
    gray = _blank()
    cv2.rectangle(gray, (100, 100), (500, 400), color=0, thickness=3)
    result = preprocess(gray, ExtractorParams())
    assert np.array_equal(result.free, cv2.bitwise_not(result.walls))
    assert result.text_mask is None  # remove_text defaults off
