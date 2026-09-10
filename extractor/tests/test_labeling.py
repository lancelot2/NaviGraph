"""Étape 4 labeling tests — deterministic mock, no API key, offline."""

from __future__ import annotations

import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.labeling import (
    MockLabeler,
    PassageType,
    label_passages,
    label_regions,
)
from navigraph_extractor.labeling.base import PassageLabel
from navigraph_extractor.schema import BBox, PassageCandidate, Region


def _rect_region(rid: int, x0: int, y0: int, x1: int, y1: int) -> Region:
    return Region(
        id=rid,
        polygon=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
        area=(x1 - x0) * (y1 - y0),
        centroid=((x0 + x1) / 2, (y0 + y1) / 2),
        bbox=BBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0),
    )


def _plan() -> np.ndarray:
    return np.full((512, 640), 255, dtype=np.uint8)


def _regions() -> list[Region]:
    return [
        _rect_region(0, 100, 100, 300, 300),
        _rect_region(1, 340, 100, 540, 300),
    ]


def test_regions_single_batch_call_no_fallback_when_confident():
    labeler = MockLabeler()
    labels = label_regions(_plan(), _regions(), labeler, ExtractorParams())

    assert labeler.region_batch_calls == 1  # ONE call for the whole plan
    assert labeler.region_crop_calls == 0  # confident -> no fallback
    assert {label.region_id for label in labels} == {0, 1}
    assert all(label.confidence >= 0.5 for label in labels)


def test_low_confidence_region_triggers_crop_fallback():
    labeler = MockLabeler(low_confidence_ids={1})
    labels = label_regions(_plan(), _regions(), labeler, ExtractorParams())

    assert labeler.region_batch_calls == 1  # still a single batch call
    assert labeler.region_crop_calls == 1  # only the low-confidence region
    by_id = {label.region_id: label for label in labels}
    assert by_id[0].confidence == 0.9 and not by_id[0].label.startswith("crop:")
    assert by_id[1].label.startswith("crop:") and by_id[1].confidence == 0.95


def _cand(pid: int) -> PassageCandidate:
    return PassageCandidate(
        id=pid, region_ids=(0, 1), bbox=BBox(0, 0, 10, 10), centroid=(5.0, 5.0), thumbnail=None
    )


def test_passages_binary_is_separate_from_type():
    labeler = MockLabeler(passage_overrides={1: PassageType.FALSE_POSITIVE})
    labels = label_passages([_cand(0), _cand(1), _cand(2)], labeler)

    assert labeler.passage_calls == 3
    by_id = {label.passage_id: label for label in labels}
    assert by_id[0].is_passage is True and by_id[0].type is PassageType.DOOR
    assert by_id[1].is_passage is False  # false positive, still a clear binary
    assert by_id[2].is_passage is True


def test_hybrid_labeler_delegates_regions_and_passages():
    from navigraph_extractor.labeling import HybridLabeler

    region_lab = MockLabeler()
    passage_lab = MockLabeler(passage_overrides={0: PassageType.WINDOW})
    hybrid = HybridLabeler(region_lab, passage_lab)

    label_regions(_plan(), _regions(), hybrid, ExtractorParams())
    assert region_lab.region_batch_calls == 1 and passage_lab.region_batch_calls == 0

    labels = label_passages([_cand(0)], hybrid)
    assert passage_lab.passage_calls == 1 and region_lab.passage_calls == 0
    assert labels[0].type is PassageType.WINDOW


def test_is_passage_derivation():
    assert PassageLabel(0, PassageType.WINDOW, 0.6).is_passage is True
    assert PassageLabel(0, PassageType.FALSE_POSITIVE, 0.9).is_passage is False
