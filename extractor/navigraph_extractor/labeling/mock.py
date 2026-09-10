"""Deterministic mock labeler so the pipeline runs and tests pass with no API key."""

from __future__ import annotations

from typing import Optional

import numpy as np

from .base import Labeler, PassageLabel, PassageType, RegionLabel

# A fixed, cycled vocabulary — deterministic, not semantically meaningful.
_ROOM_VOCAB = ["room", "office", "kitchen", "bathroom", "corridor", "storage"]


class MockLabeler(Labeler):
    """Deterministic labels; call counts and overrides expose behavior to tests.

    - `low_confidence_ids`: region ids returned with low confidence by the batch
      call (to exercise the fallback path).
    - `passage_overrides`: passage id -> forced PassageType.
    """

    def __init__(
        self,
        low_confidence_ids: Optional[set[int]] = None,
        passage_overrides: Optional[dict[int, PassageType]] = None,
    ) -> None:
        self.low_confidence_ids = low_confidence_ids or set()
        self.passage_overrides = passage_overrides or {}
        self.region_batch_calls = 0
        self.region_crop_calls = 0
        self.passage_calls = 0

    def label_regions(
        self, annotated_image: np.ndarray, region_ids: list[int]
    ) -> list[RegionLabel]:
        self.region_batch_calls += 1
        out: list[RegionLabel] = []
        for rid in region_ids:
            conf = 0.4 if rid in self.low_confidence_ids else 0.9
            out.append(
                RegionLabel(region_id=rid, label=_ROOM_VOCAB[rid % len(_ROOM_VOCAB)], confidence=conf)
            )
        return out

    def label_region_crop(
        self, crop_image: np.ndarray, region_id: int
    ) -> RegionLabel:
        self.region_crop_calls += 1
        # The fallback resolves to a confident label, tagged so tests can see it.
        return RegionLabel(
            region_id=region_id,
            label=f"crop:{_ROOM_VOCAB[region_id % len(_ROOM_VOCAB)]}",
            confidence=0.95,
        )

    def label_passage(
        self, thumbnail: Optional[np.ndarray], passage_id: int
    ) -> PassageLabel:
        self.passage_calls += 1
        ptype = self.passage_overrides.get(passage_id, PassageType.DOOR)
        conf = 0.6 if ptype in (PassageType.WINDOW, PassageType.ENTRANCE_DOOR) else 0.9
        return PassageLabel(passage_id=passage_id, type=ptype, confidence=conf)
