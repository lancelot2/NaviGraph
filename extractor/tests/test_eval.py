"""Étape 7 metrics tests — synthetic samples, offline (no dataset, no shapely)."""

from __future__ import annotations

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.eval import EvalSample, GtRoom, evaluate
from navigraph_extractor.eval.runner import evaluate_sample
from navigraph_extractor.schema import ExtractedEdge, ExtractedGraph, ExtractedNode


def _space(nid: str, x0: float, y0: float, x1: float, y1: float) -> ExtractedNode:
    return ExtractedNode(
        id=nid,
        kind="space",
        type="room",
        label=None,
        confidence=0.9,
        polygon=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
        centroid=((x0 + x1) / 2, (y0 + y1) / 2),
    )


def _sample_two_rooms() -> EvalSample:
    return EvalSample(
        name="t",
        gray=np.zeros((100, 100), dtype=np.uint8),
        gt_rooms=[
            GtRoom([(10, 10), (40, 10), (40, 90), (10, 90)], "a"),
            GtRoom([(60, 10), (90, 10), (90, 90), (60, 90)], "b"),
        ],
        gt_edges={(0, 1)},
    )


def test_perfect_match_scores_one():
    sample = _sample_two_rooms()
    passage = ExtractedNode("p0", "passage", "door", None, 0.9, [(0.4, 0.4), (0.6, 0.6)], (0.5, 0.5))
    graph = ExtractedGraph(
        nodes=[_space("r0", 0.1, 0.1, 0.4, 0.9), _space("r1", 0.6, 0.1, 0.9, 0.9), passage],
        edges=[
            ExtractedEdge("r0", "p0", True, 1.0, ("ground", "uav")),
            ExtractedEdge("r1", "p0", True, 1.0, ("ground", "uav")),
        ],
        width=100,
        height=100,
    )
    res = evaluate(sample, graph)
    assert res.n_pred_regions == 2 and res.n_gt_rooms == 2
    assert res.mean_iou > 0.99
    assert res.edge_precision == 1.0 and res.edge_recall == 1.0 and res.edge_f1 == 1.0


def test_missing_passage_gives_zero_recall():
    sample = _sample_two_rooms()
    graph = ExtractedGraph(
        nodes=[_space("r0", 0.1, 0.1, 0.4, 0.9), _space("r1", 0.6, 0.1, 0.9, 0.9)],
        edges=[],
        width=100,
        height=100,
    )
    res = evaluate(sample, graph)
    assert res.mean_iou > 0.99  # regions still match
    assert res.edge_recall == 0.0  # but the connection is missed


def _two_rooms_png() -> np.ndarray:
    img = np.full((512, 512), 255, dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (462, 462), 0, 3)
    cv2.line(img, (256, 50), (256, 462), 0, 1)
    return img


def test_end_to_end_pipeline_scores_a_synthetic_plan():
    gray = _two_rooms_png()
    sample = EvalSample(
        name="synthetic",
        gray=gray,
        gt_rooms=[
            GtRoom([(53, 53), (254, 53), (254, 460), (53, 460)], "left"),
            GtRoom([(259, 53), (460, 53), (460, 460), (259, 460)], "right"),
        ],
        gt_edges={(0, 1)},
    )
    res = evaluate_sample(sample, ExtractorParams(passage_dilation_k=5))
    assert res.n_pred_regions == 2
    assert res.edge_recall == 1.0
    assert res.mean_iou > 0.5
