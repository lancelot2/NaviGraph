"""Service tests: health + the real /extract endpoint (mock labeler, offline)."""

from __future__ import annotations

import cv2
import numpy as np
from fastapi.testclient import TestClient

from navigraph_extractor.service.app import app

client = TestClient(app)


def _two_rooms_png() -> bytes:
    img = np.full((512, 512), 255, dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (462, 462), 0, 3)  # building outline
    cv2.line(img, (256, 50), (256, 462), 0, 1)  # thin closed divider -> two rooms
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_healthz_ok():
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_extract_returns_graph():
    resp = client.post(
        "/extract",
        files={"file": ("plan.png", _two_rooms_png(), "image/png")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert {"nodes", "edges", "width", "height"} <= set(body)
    spaces = [n for n in body["nodes"] if n["kind"] == "space"]
    assert len(spaces) == 2
