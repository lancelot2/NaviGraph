"""Cross-language parity: the Python core must match the TS-generated fixtures.

These are the SAME fixtures the TypeScript parity test asserts against
(tests/fixtures/context/cases.json at the repo root), so passing both keeps the
two implementations byte-identical.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from navigraph import CoreParams, SpatialGraph, generate_context_from_graph


def _find_fixtures() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "tests" / "fixtures" / "context" / "cases.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Could not locate tests/fixtures/context/cases.json. Generate it with "
        "`UPDATE_FIXTURES=1 npx vitest run tests/context-parity.test.ts`."
    )


CASES = json.loads(_find_fixtures().read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_python_core_matches_ts_fixture(case: dict) -> None:
    graph = SpatialGraph.from_dict(case["graph"])
    req = case["request"]
    params = CoreParams(
        instruction=req["instruction"],
        current_location=req.get("currentLocation"),
        localized_node_id=req.get("localizedNodeId"),
    )
    result = generate_context_from_graph(graph, params)

    assert result.to_dict() == case["expected"]
    # Assert the byte-identical context string explicitly for a clear failure.
    assert result.context == case["expected"]["context"]
