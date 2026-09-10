"""Image loading and resolution normalization.

Kept separate from preprocessing so the pure stages operate on plain numpy
arrays. Normalization records the scale factor so geometry produced on the
working image can be mapped back to normalized [0,1] coordinates of the original.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class LoadedImage:
    """A grayscale working image plus the mapping back to the original."""

    gray: np.ndarray  # uint8 grayscale, resolution-normalized
    scale: float  # working_px / original_px
    original_size: tuple[int, int]  # (width, height) of the source image


def decode_grayscale(data: bytes) -> np.ndarray:
    """Decode image bytes to a uint8 grayscale array."""
    buf = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("Could not decode image bytes as an image.")
    return img


def normalize_resolution(gray: np.ndarray, target_long_side: int) -> tuple[np.ndarray, float]:
    """Resize so the longest side equals target_long_side, preserving aspect.

    Returns the resized image and the scale factor (working / original). Images
    already at or below the target are left untouched (scale 1.0).
    """
    h, w = gray.shape[:2]
    long_side = max(h, w)
    if long_side <= target_long_side:
        return gray, 1.0
    scale = target_long_side / long_side
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))
    resized = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized, scale


def load(data: bytes, target_long_side: int) -> LoadedImage:
    """Decode and resolution-normalize an image from raw bytes."""
    gray = decode_grayscale(data)
    h, w = gray.shape[:2]
    resized, scale = normalize_resolution(gray, target_long_side)
    return LoadedImage(gray=resized, scale=scale, original_size=(w, h))
