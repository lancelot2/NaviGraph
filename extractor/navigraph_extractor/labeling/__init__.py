"""Labeling layer (Étape 4) — LLM behind an interface, with a mock."""

from __future__ import annotations

from .base import Labeler, PassageLabel, PassageType, RegionLabel
from .mock import MockLabeler
from .openai import OpenAILabeler
from .orchestrate import label_passages, label_regions

__all__ = [
    "Labeler",
    "RegionLabel",
    "PassageLabel",
    "PassageType",
    "MockLabeler",
    "OpenAILabeler",
    "label_regions",
    "label_passages",
]
