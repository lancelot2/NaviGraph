"""OfflineBackend: zero-vision, image localization, and space-mismatch safety."""

from __future__ import annotations

import pytest

from navigraph import EmbeddingSpace, LocalizationError, OfflineBackend


def _bundle(modality: str = "image", dim: int = 3) -> dict:
    return {
        "schema_version": "1.0.0",
        "generator": "test@1",
        "generated_at": "2026-09-09T12:00:00.000Z",
        "project": {"id": "p", "name": "P"},
        "embedding": {"model": "clip-vit-b-32", "dim": dim, "modality": modality, "metric": "cosine"},
        "graph": {
            "nodes": [
                {"id": "a", "type": "room", "name": "Kitchen", "description": None, "floor": 0, "pos_x": 0, "pos_y": 0, "metadata": {}},
                {"id": "b", "type": "room", "name": "Office", "description": None, "floor": 0, "pos_x": 0, "pos_y": 0, "metadata": {}},
            ],
            "edges": [
                {"id": "e1", "source": "a", "target": "b", "type": "connected_to", "certain": True}
            ],
        },
        "references": [
            {"id": "r1", "node_id": "a", "embedding": [1.0, 0.0, 0.0]},
            {"id": "r2", "node_id": "b", "embedding": [0.0, 1.0, 0.0]},
        ],
    }


class FakeEmbedder:
    def __init__(self, vec, modality="image", dim=3, model="clip-vit-b-32"):
        self._vec = vec
        self._space = EmbeddingSpace(model=model, dim=dim, modality=modality, metric="cosine")

    def space(self):
        return self._space

    def embed_query(self, image: bytes):
        return self._vec


def test_zero_vision_needs_no_embedder():
    ng = OfflineBackend.from_file(_bundle())
    res = ng.context("go to the office", current_location="Kitchen")
    assert res.current_location == "Kitchen"
    assert res.destination == "Office"
    assert res.path == ["Kitchen", "Office"]


def test_image_localization_picks_nearest_reference():
    ng = OfflineBackend.from_file(_bundle(), embedder=FakeEmbedder([0.9, 0.1, 0.0]))
    res = ng.context("go to the office", image=b"fake-frame")
    # Query is closest to r1 (node "a" = Kitchen), so that's the current room.
    assert res.current_location == "Kitchen"
    assert res.destination == "Office"


def test_incompatible_embedder_space_raises():
    ng = OfflineBackend.from_file(_bundle(modality="image"), embedder=FakeEmbedder([0.1, 0.2, 0.3], modality="text"))
    with pytest.raises(LocalizationError):
        ng.context("go to the office", image=b"fake-frame")


def test_current_location_wins_over_image():
    # An embedder that would pick Office must be ignored when current_location is set.
    ng = OfflineBackend.from_file(_bundle(), embedder=FakeEmbedder([0.0, 1.0, 0.0]))
    res = ng.context("go to the office", image=b"frame", current_location="Kitchen")
    assert res.current_location == "Kitchen"
