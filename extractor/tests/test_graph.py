"""Étape 5 graph construction tests — pure, offline."""

from __future__ import annotations

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.graph import build_graph
from navigraph_extractor.labeling.base import PassageLabel, PassageType, RegionLabel
from navigraph_extractor.schema import BBox, PassageCandidate, Region

SHAPE = (512, 640)  # H, W


def _region(rid: int, x0: int, y0: int, x1: int, y1: int) -> Region:
    return Region(
        id=rid,
        polygon=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
        area=(x1 - x0) * (y1 - y0),
        centroid=((x0 + x1) / 2, (y0 + y1) / 2),
        bbox=BBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0),
    )


def _cand(cid: int, a: int, b: int, cx: int) -> PassageCandidate:
    return PassageCandidate(
        id=cid, region_ids=(a, b), bbox=BBox(cx - 3, 190, 6, 20), centroid=(float(cx), 200.0)
    )


def _fixture():
    regions = [_region(0, 40, 100, 200, 300), _region(1, 210, 100, 370, 300), _region(2, 380, 100, 540, 300)]
    candidates = [_cand(0, 0, 1, 205), _cand(1, 1, 2, 375)]
    region_labels = [
        RegionLabel(0, "office", 0.9),
        RegionLabel(1, "corridor", 0.9),
        RegionLabel(2, "kitchen", 0.9),
    ]
    passage_labels = [
        PassageLabel(0, PassageType.DOOR, 0.9),
        PassageLabel(1, PassageType.WINDOW, 0.6),
    ]
    return regions, candidates, region_labels, passage_labels


def test_bipartite_structure_and_counts():
    regions, cands, rlabels, plabels = _fixture()
    g = build_graph(regions, cands, rlabels, plabels, SHAPE, ExtractorParams())

    spaces = [n for n in g.nodes if n.kind == "space"]
    passages = [n for n in g.nodes if n.kind == "passage"]
    assert len(spaces) == 3
    assert len(passages) == 2
    # 2 passages x 2 endpoints each = 4 bipartite edges.
    assert len(g.edges) == 4

    node_kind = {n.id: n.kind for n in g.nodes}
    for e in g.edges:
        # Every edge is exactly space<->passage (the semantic filter).
        assert node_kind[e.source] == "space"
        assert node_kind[e.target] == "passage"


def test_profiles_by_passage_type():
    regions, cands, rlabels, plabels = _fixture()
    g = build_graph(regions, cands, rlabels, plabels, SHAPE, ExtractorParams())

    door_edges = [e for e in g.edges if e.target == "p0"]
    window_edges = [e for e in g.edges if e.target == "p1"]
    assert all(e.profiles == ("ground", "uav") for e in door_edges)
    assert all(e.profiles == ("uav",) for e in window_edges)


def test_false_positive_passage_is_dropped():
    regions, cands, rlabels, plabels = _fixture()
    # Reclassify the door as a false positive -> its node and edges vanish.
    plabels[0] = PassageLabel(0, PassageType.FALSE_POSITIVE, 0.9)
    g = build_graph(regions, cands, rlabels, plabels, SHAPE, ExtractorParams())

    assert not any(n.id == "p0" for n in g.nodes)
    assert not any(e.target == "p0" for e in g.edges)
    assert len([n for n in g.nodes if n.kind == "passage"]) == 1


def test_coordinates_normalized_and_names_applied():
    regions, cands, rlabels, plabels = _fixture()
    g = build_graph(regions, cands, rlabels, plabels, SHAPE, ExtractorParams())

    for n in g.nodes:
        cx, cy = n.centroid
        assert 0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0
    space0 = next(n for n in g.nodes if n.id == "r0")
    assert space0.label == "office" and space0.type == "room"


def test_certain_flag_and_narrow_penalty():
    regions, cands, rlabels, plabels = _fixture()
    plabels[1] = PassageLabel(1, PassageType.WINDOW, 0.3)  # below default threshold

    # Narrow penalty on: the 6px-wide overlaps get penalized.
    params = ExtractorParams(narrow_passage_px=10, narrow_passage_penalty=2.0)
    g = build_graph(regions, cands, rlabels, plabels, SHAPE, params)

    p1_edges = [e for e in g.edges if e.target == "p1"]
    assert all(e.certain is False for e in p1_edges)  # low confidence
    assert all(e.weight == 3.0 for e in p1_edges)  # 1.0 + 2.0 narrow penalty
