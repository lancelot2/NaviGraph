"""End-to-end orchestration: image bytes -> ExtractedGraph, and JSON serialization.

Wires the pure stages together with a labeler (mock by default). This is what the
HTTP service calls; the NaviGraph app maps the JSON onto its own graph schema.
"""

from __future__ import annotations

from typing import Any, Optional

from .config import ExtractorParams
from .graph import build_graph
from .image_io import load
from .labeling.base import Labeler
from .labeling.mock import MockLabeler
from .labeling.orchestrate import label_passages, label_regions
from .passages import detect_passages
from .preprocess import preprocess
from .regions import extract_regions
from .schema import ExtractedGraph


def extract_graph(
    image_bytes: bytes,
    params: Optional[ExtractorParams] = None,
    labeler: Optional[Labeler] = None,
) -> ExtractedGraph:
    """Run the full pipeline on raw image bytes."""
    params = params or ExtractorParams()
    labeler = labeler or MockLabeler()

    loaded = load(image_bytes, params.target_long_side)
    gray = loaded.gray
    shape = gray.shape[:2]  # (H, W)

    pre = preprocess(gray, params)
    regions = extract_regions(pre.free, params)
    candidates = detect_passages(regions, shape, params, source=gray)
    region_labels = label_regions(gray, regions, labeler, params)
    passage_labels = label_passages(candidates, labeler)

    return build_graph(regions, candidates, region_labels, passage_labels, shape, params)


def graph_to_dict(graph: ExtractedGraph) -> dict[str, Any]:
    """JSON-serializable view of an ExtractedGraph (normalized [0,1] coords)."""
    return {
        "nodes": [
            {
                "id": n.id,
                "kind": n.kind,
                "type": n.type,
                "label": n.label,
                "confidence": n.confidence,
                "polygon": [[x, y] for (x, y) in n.polygon],
                "centroid": [n.centroid[0], n.centroid[1]],
            }
            for n in graph.nodes
        ],
        "edges": [
            {
                "source": e.source,
                "target": e.target,
                "certain": e.certain,
                "weight": e.weight,
                "profiles": list(e.profiles),
            }
            for e in graph.edges
        ],
        "width": graph.width,
        "height": graph.height,
    }
