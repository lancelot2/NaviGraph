"""Dataset-agnostic evaluation sample.

A sample is everything the metrics need, independent of ResPlan: the input image
for the CV pipeline, the ground-truth room polygons (with labels), and the
ground-truth *traversable* room-to-room adjacency (from door/window/opening
edges). Keeping this abstract lets the metrics be unit-tested with synthetic
samples, offline, with no dataset present.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class GtRoom:
    polygon: list[tuple[float, float]]  # pixels in the input-image space
    label: str


@dataclass(frozen=True)
class EvalSample:
    name: str
    gray: np.ndarray  # input image (rasterized walls) fed to the pipeline
    gt_rooms: list[GtRoom]  # indexed 0..m-1
    gt_edges: set[tuple[int, int]] = field(default_factory=set)  # sorted (i,j) pairs
