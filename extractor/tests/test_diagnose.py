"""Recall-breakdown diagnostic tests (synthetic, offline)."""

from __future__ import annotations

import numpy as np

from navigraph_extractor.eval.diagnose import recall_breakdown
from navigraph_extractor.eval.sample import EvalSample, GtRoom
from navigraph_extractor.schema import ExtractedEdge, ExtractedGraph, ExtractedNode


def _space(nid: str, x0: float, y0: float, x1: float, y1: float) -> ExtractedNode:
    return ExtractedNode(nid, "space", "room", None, 0.9, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], ((x0 + x1) / 2, (y0 + y1) / 2))


def _sample() -> EvalSample:
    return EvalSample(
        name="t",
        gray=np.zeros((100, 100), dtype=np.uint8),
        gt_rooms=[
            GtRoom([(10, 10), (40, 10), (40, 90), (10, 90)], "a"),
            GtRoom([(60, 10), (90, 10), (90, 90), (60, 90)], "b"),
        ],
        gt_edges={(0, 1)},
    )


def test_tp_when_passage_present():
    passage = ExtractedNode("p0", "passage", "door", None, 0.9, [(0.4, 0.4), (0.6, 0.6)], (0.5, 0.5))
    g = ExtractedGraph(
        nodes=[_space("r0", 0.1, 0.1, 0.4, 0.9), _space("r1", 0.6, 0.1, 0.9, 0.9), passage],
        edges=[ExtractedEdge("r0", "p0", True, 1.0, ()), ExtractedEdge("r1", "p0", True, 1.0, ())],
        width=100, height=100,
    )
    b = recall_breakdown(_sample(), g)
    assert (b.total, b.tp, b.matched_no_adjacency) == (1, 1, 0)


def test_matched_but_no_adjacency_when_passage_missing():
    g = ExtractedGraph(
        nodes=[_space("r0", 0.1, 0.1, 0.4, 0.9), _space("r1", 0.6, 0.1, 0.9, 0.9)],
        edges=[],
        width=100, height=100,
    )
    b = recall_breakdown(_sample(), g)
    # Both rooms matched, GT edge exists, but no passage was detected.
    assert (b.total, b.tp, b.matched_no_adjacency) == (1, 0, 1)
