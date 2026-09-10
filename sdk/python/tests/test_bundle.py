"""Bundle loading and version guarding."""

from __future__ import annotations

import pytest

from navigraph import load_bundle


def _minimal(version: str = "1.0.0") -> dict:
    return {
        "schema_version": version,
        "generator": "test@1",
        "generated_at": "2026-09-09T12:00:00.000Z",
        "project": {"id": "p", "name": "P"},
        "embedding": None,
        "graph": {"nodes": [], "edges": []},
        "references": [],
    }


def test_loads_zero_vision_bundle():
    b = load_bundle(_minimal())
    assert b.embedding is None
    assert b.references == []
    assert b.is_localizable is False


def test_rejects_unsupported_major():
    with pytest.raises(ValueError):
        load_bundle(_minimal(version="2.0.0"))


def test_accepts_string_json_and_dict():
    import json

    d = _minimal()
    assert load_bundle(json.dumps(d)).schema_version == "1.0.0"
    assert load_bundle(d).schema_version == "1.0.0"
