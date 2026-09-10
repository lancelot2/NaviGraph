"""Loading and representing an exported spatial-graph bundle.

The bundle format is specified (language-independently) in
docs/spatial-graph-format.md; this module is one conforming reader.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

from .types import SpatialGraph

# The bundle MAJOR version this reader understands. A bundle with a different
# MAJOR is rejected rather than silently misread.
SUPPORTED_MAJOR = 1


@dataclass(frozen=True)
class EmbeddingSpace:
    """The vector space of a bundle's reference embeddings."""

    model: str
    dim: int
    modality: str  # "text" | "image"
    metric: str = "cosine"

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "EmbeddingSpace":
        return EmbeddingSpace(
            model=d["model"],
            dim=int(d["dim"]),
            modality=d["modality"],
            metric=d.get("metric", "cosine"),
        )


@dataclass(frozen=True)
class ReferenceEmbedding:
    id: str
    node_id: str
    embedding: list[float]


@dataclass(frozen=True)
class Bundle:
    schema_version: str
    project: dict[str, Any]
    graph: SpatialGraph
    embedding: Optional[EmbeddingSpace]
    references: list[ReferenceEmbedding]
    georeference: Optional[dict[str, Any]] = None
    generator: str = ""
    generated_at: str = ""

    @property
    def is_localizable(self) -> bool:
        """True when the bundle carries embeddings for localization."""
        return self.embedding is not None and len(self.references) > 0


def load_bundle(source: Union[str, Path, dict]) -> Bundle:
    """Load a bundle from a file path, a JSON string, or an already-parsed dict.

    Raises ``ValueError`` if the bundle's MAJOR schema version is unsupported.
    """
    if isinstance(source, dict):
        data = source
    elif isinstance(source, Path):
        data = json.loads(source.read_text(encoding="utf-8"))
    elif isinstance(source, str):
        # A path if it points at a file, otherwise treat as a JSON document.
        p = Path(source)
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
        else:
            data = json.loads(source)
    else:
        raise TypeError(f"Unsupported bundle source: {type(source)!r}")

    version = str(data.get("schema_version", ""))
    major = version.split(".", 1)[0]
    if not major.isdigit() or int(major) != SUPPORTED_MAJOR:
        raise ValueError(
            f"Unsupported bundle schema_version {version!r}; "
            f"this reader supports MAJOR {SUPPORTED_MAJOR}."
        )

    emb_raw = data.get("embedding")
    embedding = EmbeddingSpace.from_dict(emb_raw) if emb_raw else None
    references = [
        ReferenceEmbedding(
            id=r["id"], node_id=r["node_id"], embedding=list(r["embedding"])
        )
        for r in data.get("references", [])
    ]

    return Bundle(
        schema_version=version,
        project=data.get("project", {}),
        graph=SpatialGraph.from_dict(data.get("graph", {})),
        embedding=embedding,
        references=references,
        georeference=data.get("georeference"),
        generator=data.get("generator", ""),
        generated_at=data.get("generated_at", ""),
    )
