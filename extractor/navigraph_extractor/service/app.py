"""FastAPI service wrapping the extractor.

POST /extract runs the full pipeline (image -> bipartite spatial graph JSON). By
default it uses the deterministic mock labeler (no API key); set
NAVIGRAPH_LABELER=openai (with OPENAI_API_KEY) to label with a VLM.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from .. import __version__
from ..config import ExtractorParams
from ..labeling.base import Labeler
from ..labeling.mock import MockLabeler
from ..pipeline import extract_graph, graph_to_dict

app = FastAPI(title="navigraph-extractor", version=__version__)


def _make_labeler() -> Labeler:
    if os.environ.get("NAVIGRAPH_LABELER") == "openai":
        from ..labeling.openai import OpenAILabeler

        return OpenAILabeler()
    return MockLabeler()


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
    graph = extract_graph(data, cfg, _make_labeler())
    return JSONResponse(content=graph_to_dict(graph))
