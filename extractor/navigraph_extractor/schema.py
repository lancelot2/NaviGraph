"""Data structures produced by the pure stages.

Coordinates are in pixels of the working (resolution-normalized) image. Mapping
to normalized [0,1] of the original plan happens once, at graph assembly, using
the working image size — so every intermediate stage stays in one consistent,
testable pixel space.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np


@dataclass(frozen=True)
class BBox:
    """Axis-aligned bounding box in working-image pixels."""

    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class Region:
    """A closed free-space area (a room / usable space) from Étape 2."""

    id: int
    polygon: list[tuple[int, int]]  # simplified boundary, working-image pixels
    area: int  # filled area in pixels
    centroid: tuple[float, float]  # (x, y) in working-image pixels
    bbox: BBox


@dataclass(frozen=True)
class PassageCandidate:
    """A candidate opening between two regions from Étape 3.

    Purely geometric: `region_ids` is the unordered pair it connects, `centroid`
    is the overlap-zone centre (the crossing waypoint), and `thumbnail` is the
    image crop handed to the labeler in Étape 4 (None when no source image was
    provided). The type (door/window/…) is decided later; here it is only a
    candidate.
    """

    id: int
    region_ids: tuple[int, int]  # sorted (a < b)
    bbox: BBox  # bounding box of the overlap zone
    centroid: tuple[float, float]  # (x, y) in working-image pixels
    thumbnail: Optional[np.ndarray] = None


# --- Étape 5: the assembled graph (normalized [0,1] coordinates) -----------


@dataclass(frozen=True)
class ExtractedNode:
    """A graph node: a space (room) OR a passage (door/window/…).

    Coordinates are normalized to [0,1] of the plan image, so they map straight
    onto the NaviGraph schema (metadata.points / pos) regardless of resolution.
    """

    id: str  # "r<region_id>" for spaces, "p<passage_id>" for passages
    kind: Literal["space", "passage"]
    type: str  # space: room/entrance/… ; passage: door/entrance_door/window/opening
    label: Optional[str]  # semantic name (spaces); None for passages
    confidence: float
    polygon: list[tuple[float, float]]  # normalized [0,1]
    centroid: tuple[float, float]  # normalized [0,1] — crossing waypoint for passages


@dataclass(frozen=True)
class ExtractedEdge:
    """A bipartite space<->passage edge. There are never space<->space or
    passage<->passage edges (the semantic filter, enforced by construction)."""

    source: str  # a space node id
    target: str  # a passage node id
    certain: bool
    weight: float
    profiles: tuple[str, ...]  # robot capability profiles that may traverse


@dataclass(frozen=True)
class ExtractedGraph:
    nodes: list[ExtractedNode]
    edges: list[ExtractedEdge]
    width: int  # working-image size used for normalization (reference)
    height: int
