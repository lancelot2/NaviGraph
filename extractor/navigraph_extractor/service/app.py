"""FastAPI service wrapping the extractor.

POST /extract runs the full pipeline (image -> bipartite spatial graph JSON). By
default it uses the deterministic mock labeler (no API key); set
NAVIGRAPH_LABELER=openai (with OPENAI_API_KEY) to label with a VLM.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

import base64

from .. import __version__
from ..colorize import colorize_plan
from ..detect import detect_rooms
from ..walkthrough import analyze_walkthrough
from ..config import ExtractorParams
from ..labeling.base import Labeler
from ..labeling.mock import MockLabeler
from ..pipeline import extract_graph, graph_to_dict

app = FastAPI(title="navigraph-extractor", version=__version__)

# The web app now calls /extract directly from the browser (Netlify Free caps
# serverless functions at ~10s, too short for the full pipeline), so the service
# must allow cross-origin requests. Restrict with NAVIGRAPH_ALLOW_ORIGINS
# (comma-separated) in production; defaults to "*" since /extract exposes no
# secrets and processes only the uploaded plan.
_origins = [
    o.strip()
    for o in os.environ.get("NAVIGRAPH_ALLOW_ORIGINS", "*").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _make_labeler() -> Labeler:
    if os.environ.get("NAVIGRAPH_LABELER") == "openai":
        from ..labeling.openai import OpenAILabeler

        return OpenAILabeler()
    return MockLabeler()


def _use_llm_connections() -> bool:
    # Hybrid graph on by default when a VLM labeler is configured; connections are
    # a recognition task the region-overlap detector does poorly on real plans.
    return os.environ.get("NAVIGRAPH_LABELER") == "openai"


@app.get("/healthz")
def healthz() -> dict:
    """Liveness probe."""
    return {"status": "ok", "version": __version__}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    params: Optional[str] = Form(None),
) -> JSONResponse:
    """Plan image -> spatial graph JSON (see navigraph_extractor.schema)."""
    data = await file.read()
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty file"})
    cfg = ExtractorParams.model_validate_json(params) if params else ExtractorParams()
    graph = extract_graph(
        data, cfg, _make_labeler(), use_llm_connections=_use_llm_connections()
    )
    return JSONResponse(content=graph_to_dict(graph))


@app.post("/colorize")
async def colorize(
    file: UploadFile = File(...),
    wall_dilate: int = Form(13),
    min_area_pct: float = Form(0.25),
) -> JSONResponse:
    """Plan image -> { overlay_png_b64, nodes, edges }.

    - overlay_png_b64: the coloured plan (pure OpenCV, required).
    - nodes/edges: simple VLM room + adjacency detection (best-effort — an empty
      graph is returned if detection is unavailable/fails; the image still ships).
    Loosely coupled: the graph is panel data, not tied to the coloured regions.
    """
    data = await file.read()
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty file"})
    try:
        png = colorize_plan(data, wall_dilate=wall_dilate, min_area_pct=min_area_pct)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

    graph = {"nodes": [], "edges": []}
    try:
        graph = detect_rooms(data)
    except Exception as e:  # never lose the image over a detection failure
        print("detect_rooms failed:", e)

    return JSONResponse(content={
        "overlay_png_b64": base64.b64encode(png).decode("ascii"),
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    })


@app.post("/walkthrough")
async def walkthrough(
    file: UploadFile = File(...),
    frames: list[UploadFile] = File([]),
) -> JSONResponse:
    """Narrated video + key-frame images -> { nodes, edges, transcript }.

    Whisper transcribes the video, then a vision model extracts rooms + objects
    + connections (ExtractedGraphJSON shape). No floor plan → grid layout, no
    polygons. Runs here (off Netlify's ~10s cap) since it can take much longer.
    Key frames are sent as file parts (not a base64 field) to avoid the 1MB
    per-field multipart limit.
    """
    data = await file.read()
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty file"})
    frame_bytes: list[bytes] = []
    for f in frames:
        b = await f.read()
        if b:
            frame_bytes.append(b)
    try:
        graph = analyze_walkthrough(data, file.filename or "walkthrough.webm", frame_bytes)
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(e)})
    return JSONResponse(content=graph)
