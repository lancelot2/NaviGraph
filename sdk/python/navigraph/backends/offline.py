"""Offline backend: runs the full pipeline locally from an exported bundle."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from ..bundle import Bundle, load_bundle
from ..core import generate_context_from_graph
from ..embedding.base import Embedder, cosine_similarity
from ..types import ContextResult, CoreParams


class LocalizationError(RuntimeError):
    """Raised when localization is attempted with an incompatible embedder."""


class OfflineBackend:
    """Answers context queries from a bundle with no network calls.

    Zero-vision (``current_location`` supplied) needs no embedder at all. Image
    localization requires an ``embedder`` whose space matches the bundle's.
    """

    def __init__(self, bundle: Bundle, embedder: Optional[Embedder] = None) -> None:
        self.bundle = bundle
        self.embedder = embedder

    @classmethod
    def from_file(
        cls,
        source: Union[str, Path, dict],
        embedder: Optional[Embedder] = None,
    ) -> "OfflineBackend":
        """Load a bundle from a path/JSON/dict and build a backend."""
        return cls(load_bundle(source), embedder)

    def context(
        self,
        instruction: str,
        *,
        image: Optional[Union[bytes, str]] = None,
        current_location: Optional[str] = None,
    ) -> ContextResult:
        localized: Optional[str] = None
        if current_location is None and image is not None and self.embedder is not None:
            localized = self._localize(image)

        return generate_context_from_graph(
            self.bundle.graph,
            CoreParams(
                instruction=instruction,
                current_location=current_location,
                localized_node_id=localized,
            ),
        )

    def _localize(self, image: Union[bytes, str]) -> Optional[str]:
        if not self.bundle.is_localizable:
            return None
        assert self.embedder is not None  # guarded by caller
        space = self.embedder.space()
        b = self.bundle.embedding
        assert b is not None  # implied by is_localizable

        if (space.model, space.dim, space.modality) != (b.model, b.dim, b.modality):
            raise LocalizationError(
                "Embedder is incompatible with this bundle. "
                f"Embedder space is model={space.model!r} dim={space.dim} "
                f"modality={space.modality!r}, but the bundle was embedded with "
                f"model={b.model!r} dim={b.dim} modality={b.modality!r}. "
                "Use a matching embedder, or the zero-vision path "
                "(pass current_location)."
            )

        if isinstance(image, str):
            raise LocalizationError(
                "Offline localization needs raw image bytes, not a string."
            )
        query = self.embedder.embed_query(image)
        if len(query) != b.dim:
            raise LocalizationError(
                f"Query embedding has dim {len(query)}, expected {b.dim}."
            )

        best_id: Optional[str] = None
        best_sim = float("-inf")
        for ref in self.bundle.references:
            sim = cosine_similarity(query, ref.embedding)
            if sim > best_sim:
                best_sim = sim
                best_id = ref.node_id
        return best_id
