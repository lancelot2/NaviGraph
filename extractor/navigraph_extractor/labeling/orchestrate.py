"""Labeling orchestration: one whole-plan call for regions, with a crop fallback.

Keeps the "single call for all regions" guarantee, and re-labels only the
low-confidence regions individually from a context-padded crop.
"""

from __future__ import annotations

import numpy as np

from ..config import ExtractorParams
from ..debug import render_regions
from ..schema import BBox, PassageCandidate, Region
from .base import Labeler, PassageLabel, RegionLabel


def _crop(gray: np.ndarray, bbox: BBox, margin: int) -> np.ndarray:
    h, w = gray.shape[:2]
    x0 = max(0, bbox.x - margin)
    y0 = max(0, bbox.y - margin)
    x1 = min(w, bbox.x + bbox.w + margin)
    y1 = min(h, bbox.y + bbox.h + margin)
    return gray[y0:y1, x0:x1].copy()


def label_regions(
    plan_gray: np.ndarray,
    regions: list[Region],
    labeler: Labeler,
    params: ExtractorParams,
) -> list[RegionLabel]:
    """Label all regions in one call; re-label low-confidence ones from crops."""
    annotated = render_regions(plan_gray, regions)
    batch = labeler.label_regions(annotated, [r.id for r in regions])
    by_id = {label.region_id: label for label in batch}

    resolved: list[RegionLabel] = []
    for region in regions:
        label = by_id.get(region.id)
        if label is None or label.confidence < params.region_conf_threshold:
            crop = _crop(plan_gray, region.bbox, params.region_fallback_margin_px)
            label = labeler.label_region_crop(crop, region.id)
        resolved.append(label)
    return resolved


def label_passages(
    candidates: list[PassageCandidate], labeler: Labeler
) -> list[PassageLabel]:
    """Classify each candidate vignette independently."""
    return [labeler.label_passage(c.thumbnail, c.id) for c in candidates]
