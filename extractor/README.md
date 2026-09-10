# navigraph-extractor

Deterministic floor-plan geometry extraction, with the LLM used **only** for
labeling — the FloorPlan2Nav-style decoupling of geometry from semantics. Classic
computer vision (OpenCV) segments regions and finds passages at the pixel level;
a VLM merely names regions and classifies passages. The VLM never returns
coordinates.

This is a standalone Python package called over HTTP by the NaviGraph web app,
and the basis for evaluation on the ResPlan dataset.

## Pipeline

| Stage | Module | Deterministic? |
| --- | --- | --- |
| 1. Preprocess | `preprocess.py` | ✅ pure |
| 2. Regions | `regions.py` | ✅ pure, zero LLM |
| 3. Passage candidates | `passages.py` | ✅ pure |
| 4. Labeling | `labeling/` | ❌ LLM (mock available) |
| 5. Graph | `graph.py` | ✅ pure |
| 6. Visual debug | `debug.py` | — |
| 7. Evaluation | `eval/` | — |

Steps 1, 2, 3 and 5 are pure and offline-testable.

## Install

```bash
pip install -e ".[service,dev]"   # service (FastAPI) + test deps
pytest
```

## Run the service

```bash
uvicorn navigraph_extractor.service.app:app --reload
# or
docker build -t navigraph-extractor . && docker run -p 8000:8000 navigraph-extractor
```

- `GET /healthz` — liveness.
- `POST /extract` — plan image → spatial graph (wired as the pipeline lands).

## Status

Étape 0 (skeleton) and Étape 1 (preprocessing) are in place; regions, passages,
labeling, graph, and evaluation follow.
