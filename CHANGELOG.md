# Changelog

All notable changes to NaviGraph are documented here.

**Versioning.** `MAJOR.MINOR.PATCH`. A **minor** bump (`1.1.0` → `1.2.0`) marks a
small release; a **major** bump (`1.x` → `2.0.0`) marks a big one. The current
version is also in [`package.json`](package.json) and tagged in git (`v1.1.0`).

## [1.4.0] — 2026-09-14

### Changed
- Default vision model is now **`gpt-4.1`** (was `gpt-4o`). On real floor plans it
  localizes room top-left corners and polygons markedly better — e.g. gpt-4o
  placed the Primary Suite's corner inside the garage; gpt-4.1 places it correctly.
  Override with `OPENAI_VISION_MODEL`.

## [1.3.1] — 2026-09-14

### Fixed
- The `openai` provider now returns both a bounding box and a polygon per room,
  validates the polygon (rejecting degenerate, line-like shapes GPT occasionally
  emits), and falls back to the bounding box when the polygon is unusable — so the
  overlay never degrades below the previous rectangle behavior.

## [1.3.0] — 2026-09-14

### Changed
- The `openai` vision provider now returns each room as a **polygon** (`points`)
  instead of a bounding box, so the overlay can follow non-rectangular rooms.

### Fixed
- `buildGraph` now logs graph node/edge insert errors instead of swallowing them.
  (A missing `edges.metadata` column had been silently dropping every connection;
  the column has been added to the database.)

## [1.2.0] — 2026-09-14

Hybrid graph (deterministic geometry + LLM topology) and cleaner polygon overlays.

### Added
- **Hybrid graph path.** Room-to-room connections now come from the labeler
  (`Labeler.label_connections`, implemented by the mock, OpenAI, and Hybrid
  backends) — a recognition task the VLM does well — instead of the region-overlap
  detector that returned no connections on some real plans. Enabled via
  `use_llm_connections` in the pipeline, and on by default in the service when
  `NAVIGRAPH_LABELER=openai`. Produces direct room↔room `connected_to` edges.
- **Polygon-overlay quality:** text/furniture removal on by default; rectilinear
  vertex snapping (`rectilinear`); and growth to the wall centerline
  (`snap_to_walls`) so region outlines sit on the walls, not inside them.

### Changed
- `Labeler` interface gains `label_connections` (all backends implement it).
- Defaults: `remove_text`, `rectilinear`, and `snap_to_walls` are now on.

## [1.1.0] — 2026-09-14

Deterministic floor-plan extractor (FloorPlan2Nav-style: geometry decoupled from
semantics) and its evaluation.

### Added
- **`/extractor`** — standalone Python package + FastAPI service. Classic
  computer vision does the geometry; the LLM only labels.
  - Preprocessing (grayscale, 512 normalization, Otsu/adaptive binarization,
    optional text/furniture removal, configurable wall-sealing).
  - Region extraction (connected components of free space; border + min-area%
    rules; contour + `approxPolyDP`).
  - Passage-candidate detection (per-region dilation overlap; `k` derivable from
    the measured wall thickness — the lever that lifted edge F1 0.004 → 0.16).
  - LLM labeling behind an interface with a deterministic mock, an OpenAI backend,
    and a `HybridLabeler`; one call for all regions with a low-confidence crop
    fallback; binary passage decision kept separate from the type.
  - Bipartite graph (passages are nodes; only space↔passage edges; robot-capability
    profiles; weights; passage centroids as waypoints).
  - Per-stage annotated-PNG debug dump.
- **ResPlan evaluation harness** — dataset-agnostic metrics (region count,
  per-region IoU, edge precision/recall), a ResPlan adapter, a CLI with a
  versioned baseline, and a `recall_breakdown` diagnostic.

### Changed
- **Graph schema migration** (additive; hosted app and `/api/context` unchanged):
  passage node types (`door`/`entrance_door`/`window`/`opening`), `EdgeMetadata`
  (weight, profiles) via an `edges.metadata` jsonb column surfaced by
  `api_load_graph`, `ParsedNode.points`, and a `VISION_PROVIDER=extractor` backend.

### Docs
- Documented the ResPlan plateau: segmentation is solid (IoU ~0.65) but graph edge
  reconstruction plateaus (F1 ~0.16); the recall diagnostic localizes it to the
  passage detector, and the levers that were tried and ruled out are recorded so
  they are not repeated. ResPlan measures segmentation, not the graph.

## [1.0.0] — 2026-09-10

Open-source, offline-first foundation (turns a hosted-only app into a licensed,
robot-deployable project).

### Added
- Apache-2.0 `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a
  committed `.env.example`.
- Database schema as checked-in migrations (tables, RLS, pgvector, RPCs, storage
  buckets) so a clean clone boots.
- Offline spatial-graph **bundle export** + public format spec + JSON Schema.
- **`navigraph` Python SDK**: hosted and offline backends over one interface,
  pluggable embedders (local ONNX default, OpenAI opt-in), a zero-vision path, and
  a byte-identical TypeScript↔Python context **parity test**.
- **ROS 2** packages (Humble & Jazzy): image subscriber, context service + topic,
  and `nav_msgs/Path` when the bundle is georeferenced.
- One-command **Docker self-host** (app + local Supabase, no OpenAI key required),
  GitHub Actions CI, and runnable `examples/`.

[1.4.0]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.4.0
[1.3.1]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.3.1
[1.3.0]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.3.0
[1.2.0]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.2.0
[1.1.0]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.1.0
[1.0.0]: https://github.com/lancelot2/NaviGraph/releases/tag/v1.0.0
