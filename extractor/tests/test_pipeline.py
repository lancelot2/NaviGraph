"""End-to-end pipeline test on a synthetic plan (mock labeler, offline)."""

from __future__ import annotations

import json

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.labeling.mock import MockLabeler
from navigraph_extractor.pipeline import extract_graph, graph_to_dict


def _two_rooms_png() -> bytes:
    # Two rooms separated by a closed 3px divider inside a building outline.
    img = np.full((512, 512), 255, dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (462, 462), 0, 3)
    cv2.line(img, (256, 50), (256, 462), 0, 1)  # thin divider, bridged by k=5
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_pipeline_two_rooms_one_passage():
    g = extract_graph(
        _two_rooms_png(), ExtractorParams(passage_dilation_k=5), MockLabeler()
    )
    spaces = [n for n in g.nodes if n.kind == "space"]
    passages = [n for n in g.nodes if n.kind == "passage"]
    assert len(spaces) == 2
    # The thin divider is bridged by dilation -> at least one passage candidate.
    assert len(passages) >= 1

    kind = {n.id: n.kind for n in g.nodes}
    for e in g.edges:  # bipartite invariant end to end
        assert kind[e.source] == "space"
        assert kind[e.target] == "passage"


def test_graph_to_dict_is_json_serializable():
    g = extract_graph(
        _two_rooms_png(), ExtractorParams(passage_dilation_k=5), MockLabeler()
    )
    payload = json.dumps(graph_to_dict(g))
    assert '"nodes"' in payload and '"edges"' in payload
