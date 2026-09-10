"""NaviGraph — offline-first spatial navigation context for robots.

Two interchangeable backends behind one interface:

    from navigraph import HostedBackend, OfflineBackend

    # Hosted (calls a NaviGraph deployment)
    ng = HostedBackend("https://navigraph.cloud", project_id="…", api_key="navi_…")
    res = ng.context("go to the supply room", current_location="lobby")

    # Offline, zero-vision (no model needed — pose comes from your stack)
    ng = OfflineBackend.from_file("building.navigraph.json")
    res = ng.context("go to the supply room", current_location="lobby")
    print(res.context)

    # Offline with local image localization
    from navigraph.embedding import OnnxImageEmbedder
    ng = OfflineBackend.from_file(
        "building.navigraph.json",
        embedder=OnnxImageEmbedder("clip_image.onnx", dim=512),
    )
    res = ng.context("go to the supply room", image=frame_bytes)
"""

from __future__ import annotations

from .backends import Backend, HostedBackend, LocalizationError, OfflineBackend
from .bundle import Bundle, EmbeddingSpace, ReferenceEmbedding, load_bundle
from .core import generate_context_from_graph
from .types import ContextResult, CoreParams, GraphEdge, GraphNode, SpatialGraph

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "Backend",
    "HostedBackend",
    "OfflineBackend",
    "LocalizationError",
    "Bundle",
    "EmbeddingSpace",
    "ReferenceEmbedding",
    "load_bundle",
    "ContextResult",
    "CoreParams",
    "SpatialGraph",
    "GraphNode",
    "GraphEdge",
    "generate_context_from_graph",
]
