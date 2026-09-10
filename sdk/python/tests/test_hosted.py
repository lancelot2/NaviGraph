"""HostedBackend request construction and response parsing (no real network)."""

from __future__ import annotations

import json

from navigraph import HostedBackend
from navigraph.backends import hosted as hosted_mod


class _FakeResponse:
    def __init__(self, payload: dict):
        self._data = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_hosted_builds_request_and_parses_response(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["headers"] = {k.lower(): v for k, v in req.header_items()}
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse(
            {
                "current_location": "Lobby",
                "destination": "Office",
                "path": ["Lobby", "Office"],
                "landmarks": [],
                "context": "You are in Lobby. Goal: reach Office.",
            }
        )

    monkeypatch.setattr(hosted_mod.urllib.request, "urlopen", fake_urlopen)

    ng = HostedBackend("https://navigraph.cloud/", project_id="proj-1", api_key="navi_abc")
    res = ng.context("go to the office", current_location="Lobby")

    assert captured["url"] == "https://navigraph.cloud/api/context"
    assert captured["method"] == "POST"
    assert captured["headers"]["authorization"] == "Bearer navi_abc"
    assert captured["body"] == {
        "projectId": "proj-1",
        "instruction": "go to the office",
        "current_location": "Lobby",
    }
    assert res.current_location == "Lobby"
    assert res.path == ["Lobby", "Office"]


def test_hosted_encodes_image_bytes(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse(
            {"current_location": None, "destination": None, "path": [], "landmarks": [], "context": ""}
        )

    monkeypatch.setattr(hosted_mod.urllib.request, "urlopen", fake_urlopen)

    ng = HostedBackend("https://navigraph.cloud", project_id="p")
    ng.context("go", image=b"\x00\x01\x02")

    import base64

    assert captured["body"]["image"] == base64.b64encode(b"\x00\x01\x02").decode("ascii")
