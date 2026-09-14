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

### Results on ResPlan — and the current plateau

Validated on the real ResPlan pickle (17,107 plans). Baseline (n=100, tuned
config `wall_close_ksize=21` + `passage_k_from_walls`, see `eval/baseline.json`):

| metric | value | reading |
| --- | --- | --- |
| per-region IoU | **0.65** | segmentation is solid |
| region / GT count | 0.77 | most rooms are found |
| edge F1 | **0.16** | the graph is weak |

**The graph, not the segmentation, is the bottleneck — and it is the passage
detector.** The recall diagnostic (`eval/diagnose.py`, `recall_breakdown`)
decomposes the missed ground-truth edges: **~73% are pairs where both rooms are
correctly detected and matched, but no passage is detected between them** (only
~13% are matching/segmentation failures). So the low edge recall is real and
localized to the region-dilation-overlap detector, whose `seal`↔`k` tension caps
it: sealing a doorway thickens the wall there until the dilation `k` can no longer
bridge it.

**One lever moved it:** deriving `k` from the measured wall thickness
(`passage_k_from_walls`) lifted edge F1 from 0.004 → 0.16.

**Ruled out by measurement (don't re-try these on ResPlan):**
- VLM passage labeling (`OpenAILabeler`) — *worse* (F1 0.18→0.11): the rasterized
  vignettes carry no recognizable door cues, so the VLM prunes true passages.
- Rendering door/window layers as grey cues — destabilizes Otsu, wrecks regions.
- Sealing doorways from the door layer — no recall gain.
- Dissolving the fragmented wall polygons — no change (F1 0.14→0.13).

**Conclusion.** ResPlan is a good **segmentation** benchmark but the wrong one for
the **graph**: its abstract vectors lack the drawing conventions the method relies
on (door arcs, uniform wall strokes, symbols), and no rasterization recovers them.
Pushing graph quality needs a dataset of **real floor-plan drawings** (e.g.
CubiCasa5K). The metrics core and `recall_breakdown` are dataset-agnostic and
ready to point at one; only a new loader (+ adjacency-graph derivation) is needed.

## Status

All stages (0-7) are implemented and covered by pytest; the ResPlan adapter is
validated on the real dataset. The extractor's geometry (segmentation) works on
clean/vector-style plans; the **graph reconstruction is at a measured plateau on
ResPlan** (edge F1 ~0.16, see above) pending a real drawn-plan benchmark.

**Experimental — not for production on real plans.** On real, *furnished*
architectural drawings the free-space segmentation fragments (furniture line-art
breaks rooms apart; resolution normalization thins the walls), so region and
therefore graph extraction are unreliable. The hosted app should use
`VISION_PROVIDER=openai` (the LLM-direct method), which extracts rooms and
connections well on real plans. This extractor is kept for clean/vector inputs,
evaluation, and ongoing work on the polygon overlay.
