"""Étape 6 — the per-stage PNG dump writes all four images."""

from __future__ import annotations

import os

import cv2
import numpy as np

from navigraph_extractor.config import ExtractorParams
from navigraph_extractor.dump import dump_stages


def _two_rooms_png() -> bytes:
    img = np.full((512, 512), 255, dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (462, 462), 0, 3)
    cv2.line(img, (256, 50), (256, 462), 0, 1)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def test_dump_writes_all_stage_pngs(tmp_path):
    out = str(tmp_path / "debug")
    paths = dump_stages(_two_rooms_png(), out, ExtractorParams(passage_dilation_k=5))

    names = sorted(os.path.basename(p) for p in paths)
    assert names == [
        "01_binarization.png",
        "02_regions.png",
        "03_passages.png",
        "04_graph.png",
    ]
    for p in paths:
        assert os.path.exists(p) and os.path.getsize(p) > 0
