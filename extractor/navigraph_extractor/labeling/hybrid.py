"""Compose two labelers: one for regions, another for passages.

Useful when only the passage decision needs a real VLM (it drives edge
precision), while region names — which don't affect geometry/graph metrics — can
stay on the cheap/mock labeler.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from .base import Labeler, PassageLabel, RegionLabel


class HybridLabeler(Labeler):
    def __init__(self, region_labeler: Labeler, passage_labeler: Labeler) -> None:
        self.region_labeler = region_labeler
        self.passage_labeler = passage_labeler

    def label_regions(
        self, annotated_image: np.ndarray, region_ids: list[int]
    ) -> list[RegionLabel]:
        return self.region_labeler.label_regions(annotated_image, region_ids)

    def label_region_crop(self, crop_image: np.ndarray, region_id: int) -> RegionLabel:
        return self.region_labeler.label_region_crop(crop_image, region_id)

    def label_passage(
        self, thumbnail: Optional[np.ndarray], passage_id: int
    ) -> PassageLabel:
        return self.passage_labeler.label_passage(thumbnail, passage_id)
