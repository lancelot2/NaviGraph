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

## Debug images

Write an annotated PNG per stage for a plan:

```bash
python -m navigraph_extractor.dump plan.png --out debug_out/
# -> 01_binarization.png 02_regions.png 03_passages.png 04_graph.png
```

## Evaluation (ResPlan)

ResPlan (github.com/m-agour/ResPlan) is a pickle of vector plans with a NetworkX
room-connectivity graph. Metrics: region count, per-region IoU vs GT polygons,
and edge precision/recall vs the traversable (door/window/opening) adjacency.

```bash
pip install -e ".[eval]"                 # shapely + networkx
python -m navigraph_extractor.eval --dataset resplan --n 200 --data ResPlan.pkl
#   add --update-baseline to record eval/baseline.json for regression tracking
```

## Status

All stages (0-7) are implemented. Pure/offline stages (preprocess, regions,
passages, graph) and the metrics core are covered by pytest. The ResPlan wall
rasterization in `eval/resplan.py` is the one part pending validation against the
real dataset.
