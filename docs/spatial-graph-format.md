# NaviGraph Spatial-Graph Bundle Format

**Version 1.0.0**

A spatial-graph bundle is a single, self-describing, versioned file that captures
everything needed to reason about navigation inside one building — its rooms and
how they connect, what each room contains, and precomputed embeddings for
recognising where a camera frame was taken — **with no network access**.

This document specifies the format as a public interface. You do not need
NaviGraph to produce or consume a bundle; any tool that follows this spec is
compatible. The machine-readable schema is
[`spatial-graph-format.schema.json`](spatial-graph-format.schema.json)
(JSON Schema draft 2020-12), and it is the normative reference where this prose
is ambiguous.

## Design principles

1. **Topological, not metric.** The graph describes *connectivity* — which places
   reach which — not precise geometry. This is what a robot needs to plan a route
   through a building and what survives a floor plan that is not to scale. Metric
   coordinates are an *optional* add-on (see [Georeference](#georeference)).
2. **Self-describing embeddings.** A bundle states exactly which model, modality,
   and dimensionality its reference embeddings use, so a consumer can refuse to
   localize with an incompatible query embedder rather than return nonsense.
3. **Works with zero vision.** Localization is optional. A bundle with no
   embeddings (`embedding: null`, `references: []`) still supports planning and
   context generation when the caller supplies the current location directly
   (e.g. from a robot's existing pose estimate).

## Top-level structure

```jsonc
{
  "schema_version": "1.0.0",
  "generator": "navigraph-web@0.1.0",
  "generated_at": "2026-09-09T12:00:00.000Z",
  "project":   { "id": "...", "name": "..." },
  "embedding": { "model": "...", "dim": 512, "modality": "text", "metric": "cosine" },
  "graph":     { "nodes": [ ... ], "edges": [ ... ] },
  "references": [ { "id": "...", "node_id": "...", "embedding": [ ... ] } ],
  "georeference": { ... }   // optional
}
```

| Field | Required | Description |
| --- | --- | --- |
| `schema_version` | yes | Format version (semver). See [Versioning](#versioning). |
| `generator` | yes | What produced the bundle, e.g. `navigraph-web@0.1.0`. |
| `generated_at` | yes | ISO 8601 UTC timestamp. |
| `project` | yes | `{ id, name }` of the source building. |
| `embedding` | yes | Descriptor of the reference vector space, or `null`. |
| `graph` | yes | The spatial graph: `nodes` + `edges`. |
| `references` | yes | Precomputed reference embeddings (may be empty). |
| `georeference` | no | Optional metric anchoring into a map frame. |

## Nodes

A node is a place in the building.

```jsonc
{
  "id": "8f3c…",
  "type": "room",              // room | entrance | stair | elevator | landmark
  "name": "Supply Room",       // string or null
  "description": "…",          // string or null
  "floor": 0,                  // integer storey
  "pos_x": 680, "pos_y": 360,  // layout-canvas coordinates (NOT metric)
  "metadata": { … }
}
```

- **`type`** — one of `room`, `entrance`, `stair`, `elevator`, `landmark`.
  `stair` and `elevator` are the inter-floor connectors; a route that changes
  `floor` is expected to pass through one of them.
- **`pos_x` / `pos_y`** are coordinates on an abstract layout canvas used for
  drawing the graph. They are **not** metric and carry no real-world scale. Do
  not derive distances from them; use [`georeference`](#georeference) for that.
- **`metadata`** carries photo-derived semantics and the room's outline on the
  plan image:

  | Key | Type | Meaning |
  | --- | --- | --- |
  | `objects` | `string[]` | Notable objects seen in the room. |
  | `landmarks` | `string[]` | Distinctive features useful for recognition. |
  | `signs` | `string[]` | Text on visible signs/labels/doors. |
  | `synonyms` | `string[]` | Alternative names a person might use. |
  | `bounds` | `{x,y,w,h}` | Normalized `[0,1]` bounding box on the plan image. |
  | `points` | `{x,y}[]` | Normalized `[0,1]` polygon outline; supersedes `bounds`. |

  All metadata keys are optional. `bounds` and `points` are in **normalized image
  coordinates**: `(0,0)` is the top-left of the plan image, `(1,1)` the
  bottom-right.

## Edges

An edge is a connection between two nodes. Edges are **undirected** for the
purpose of navigation — traversable in both directions.

```jsonc
{ "id": "…", "source": "<node id>", "target": "<node id>", "type": "connected_to", "certain": true }
```

- **`type`** — `connected_to` (a doorway/passage joins the rooms),
  `adjacent_to` (they share a wall but a connection is uncertain), or `contains`
  (one node encloses another, e.g. a room containing a landmark).
- **`certain`** — `false` marks a connection the builder was not confident about.
  Consumers may treat uncertain edges as traversable but should surface the
  uncertainty when it matters.

## Embedding space

```jsonc
"embedding": { "model": "text-embedding-3-small", "dim": 512, "modality": "text", "metric": "cosine" }
```

Describes the vector space shared by every entry in `references`:

- **`model`** — free-form identifier of the embedding model (e.g.
  `text-embedding-3-small`, `clip-vit-b-32`, `dinov2-vits14`, `mock`).
- **`dim`** — the exact length of every reference vector.
- **`modality`** — `text` (embeddings of scene *text* extracted from a photo) or
  `image` (embeddings of the image itself). These are **not interchangeable**.
- **`metric`** — `cosine`.

**Compatibility rule.** To localize a query against a bundle, the query embedder
**must** match the bundle's `model`, `dim`, and `modality`. A consumer that
cannot produce a matching query vector must **not** attempt localization against
these references — it should either fall back to a caller-supplied location or
report that localization is unavailable, rather than compare across spaces.

`embedding` is `null` exactly when `references` is empty.

## References

```jsonc
{ "id": "<opaque>", "node_id": "<node id>", "embedding": [ /* dim floats */ ] }
```

Each reference is a precomputed embedding that identifies a node. Localization
finds the reference nearest (by the declared `metric`) to a query embedding and
returns its `node_id`. A node may have several references. `embedding` has
exactly `embedding.dim` elements.

## Georeference

*Optional.* Present only when the graph can be anchored to a planar metric frame
(most bundles omit it). It maps normalized plan-image coordinates to a map frame,
enabling metric output such as a ROS 2 `nav_msgs/Path`.

```jsonc
"georeference": {
  "frame_id": "map",
  "resolution": 0.05,          // meters per plan-image pixel
  "image_width": 1024,
  "image_height": 768,
  "origin": { "x": 0.0, "y": 0.0, "theta": 0.0 }   // map pose of plan pixel (0,0)
}
```

To place a node in the map frame, take its centroid in normalized coordinates
(from `metadata.points` or the centre of `metadata.bounds`), scale by the image
pixel dimensions and `resolution` to meters, then apply `origin` (translation +
`theta` rotation). When `georeference` is absent, the graph is topological-only
and no metric coordinates should be inferred.

## Versioning

`schema_version` is semver:

- **PATCH** — editorial/clarifying changes; no structural change.
- **MINOR** — backward-compatible additions (new optional fields). A consumer
  written for an older MINOR must ignore unknown fields and keep working.
- **MAJOR** — breaking changes. A consumer **must reject** a `schema_version`
  whose MAJOR it does not recognise.

## Consuming a bundle

A typical consumer runs four steps:

1. **Localization** — embed the query (camera frame or its scene text), find the
   nearest `references` entry, and take its `node_id` as the current location.
   *Skipped entirely* when the caller supplies the current location.
2. **Destination resolution** — match the free-text goal against node names and
   `metadata` (synonyms, landmarks, signs).
3. **Planning** — shortest path over `edges` (treated as undirected) from current
   to destination, crossing floors via `stair`/`elevator` nodes.
4. **Context generation** — render the route and destination knowledge into a
   plain-text brief for a navigation model.

Steps 2–4 are fully deterministic and depend only on the bundle contents and the
instruction — not on any model — so two correct implementations produce identical
output. The exact algorithm is specified alongside the reference implementations
(see the project's context-core parity tests).

## Minimal example

A two-room, zero-vision bundle (no embeddings — planning and context only):

```json
{
  "schema_version": "1.0.0",
  "generator": "example@1",
  "generated_at": "2026-09-09T12:00:00.000Z",
  "project": { "id": "demo", "name": "Demo" },
  "embedding": null,
  "graph": {
    "nodes": [
      { "id": "a", "type": "entrance", "name": "Main Entrance", "description": null, "floor": 0, "pos_x": 40,  "pos_y": 240, "metadata": {} },
      { "id": "b", "type": "room",     "name": "Supply Room",   "description": null, "floor": 0, "pos_x": 240, "pos_y": 240, "metadata": { "landmarks": ["Metal shelves"] } }
    ],
    "edges": [
      { "id": "e1", "source": "a", "target": "b", "type": "connected_to", "certain": true }
    ]
  },
  "references": []
}
```
