"""The pluggable embedding interface for offline localization.

An embedder turns a camera frame into a query vector in a declared space. The
offline backend only localizes when the embedder's space matches the bundle's,
so a CLIP query vector is never compared against text-embedding references.
"""

from __future__ import annotations

import math
from typing import Protocol, Sequence, runtime_checkable

from ..bundle import EmbeddingSpace

__all__ = ["Embedder", "EmbeddingSpace", "cosine_similarity"]


@runtime_checkable
class Embedder(Protocol):
    """Produces a query embedding from a camera frame, in a declared space."""

    def space(self) -> EmbeddingSpace:
        """Describe this embedder's output space (model, dim, modality, metric)."""
        ...

    def embed_query(self, image: bytes) -> list[float]:
        """Embed a camera frame (image bytes) into a vector of length space().dim."""
        ...


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity of two equal-length vectors (0 if either is degenerate)."""
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    return dot / denom if denom else 0.0
