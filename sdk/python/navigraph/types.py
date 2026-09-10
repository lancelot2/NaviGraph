"""Core domain types for NaviGraph, mirroring the TypeScript engine.

These are intentionally thin: the spatial graph is topological, and node
semantics live in a free-form ``metadata`` dict so the shape matches the
exported bundle (see docs/spatial-graph-format.md) exactly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class GraphNode:
    """A place in the building (room, entrance, stair, elevator, landmark)."""

    id: str
    type: str
    name: Optional[str]
    description: Optional[str]
    floor: int
    pos_x: float
    pos_y: float
    metadata: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "GraphNode":
        return GraphNode(
            id=d["id"],
            type=d["type"],
            name=d.get("name"),
            description=d.get("description"),
            # floor is an integer storey; coerce so string formatting matches
            # the TS `${floor}` (which never emits a trailing ".0").
            floor=int(d.get("floor", 0)),
            pos_x=d.get("pos_x", 0),
            pos_y=d.get("pos_y", 0),
            metadata=d.get("metadata") or {},
        )


@dataclass(frozen=True)
class GraphEdge:
    """An undirected navigable connection between two nodes."""

    id: str
    source: str
    target: str
    type: str
    certain: bool

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "GraphEdge":
        return GraphEdge(
            id=d.get("id", ""),
            source=d["source"],
            target=d["target"],
            type=d["type"],
            certain=bool(d.get("certain", True)),
        )


@dataclass(frozen=True)
class SpatialGraph:
    nodes: list[GraphNode]
    edges: list[GraphEdge]

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "SpatialGraph":
        return SpatialGraph(
            nodes=[GraphNode.from_dict(n) for n in d.get("nodes", [])],
            edges=[GraphEdge.from_dict(e) for e in d.get("edges", [])],
        )


@dataclass(frozen=True)
class ContextResult:
    """The result of the context pipeline — identical shape to POST /api/context."""

    current_location: Optional[str]
    destination: Optional[str]
    path: list[str]
    landmarks: list[str]
    context: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_location": self.current_location,
            "destination": self.destination,
            "path": self.path,
            "landmarks": self.landmarks,
            "context": self.context,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "ContextResult":
        return ContextResult(
            current_location=d.get("current_location"),
            destination=d.get("destination"),
            path=list(d.get("path", [])),
            landmarks=list(d.get("landmarks", [])),
            context=d.get("context", ""),
        )


@dataclass(frozen=True)
class CoreParams:
    """Inputs to the deterministic context core.

    ``localized_node_id`` carries the outcome of image-embedding localization,
    which the caller performs (it is model-dependent and not part of the parity
    contract).
    """

    instruction: str
    current_location: Optional[str] = None
    localized_node_id: Optional[str] = None
