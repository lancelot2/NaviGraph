"""Labeling interface and result types — the only non-deterministic layer.

The interface is deliberately image-in / labels-out and works on ids, never
coordinates: the LLM recognizes, it does not delimit. A mock implementation lets
the whole pipeline run and be tested without an API key.

The binary "is this a real passage" decision (`PassageLabel.is_passage`) is kept
separate from the finer type (door/window/…), since the type is the known weak
point (~96% F1) while the binary decision is reliable (~99.7%).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import numpy as np


class PassageType(str, Enum):
    DOOR = "door"
    ENTRANCE_DOOR = "entrance_door"
    WINDOW = "window"
    OPENING = "opening"
    FALSE_POSITIVE = "false_positive"


@dataclass(frozen=True)
class RegionLabel:
    region_id: int
    label: str  # a free-text semantic name, e.g. "kitchen"
    confidence: float


@dataclass(frozen=True)
class PassageLabel:
    passage_id: int
    type: PassageType
    confidence: float

    @property
    def is_passage(self) -> bool:
        """The reliable binary: a candidate is a real passage unless a false positive."""
        return self.type is not PassageType.FALSE_POSITIVE


class Labeler(ABC):
    """A backend that names regions and classifies passage vignettes."""

    @abstractmethod
    def label_regions(
        self, annotated_image: np.ndarray, region_ids: list[int]
    ) -> list[RegionLabel]:
        """One call for the whole plan: the numbered/outlined image -> labels."""

    @abstractmethod
    def label_region_crop(
        self, crop_image: np.ndarray, region_id: int
    ) -> RegionLabel:
        """Fallback: label a single region from a context-padded crop."""

    @abstractmethod
    def label_passage(
        self, thumbnail: Optional[np.ndarray], passage_id: int
    ) -> PassageLabel:
        """Classify one passage candidate vignette."""
