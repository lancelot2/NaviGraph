# navigraph

Offline-first spatial navigation context for robots. Turn a building's spatial
graph into a plain-text navigation brief — the current location, the destination,
the planned route, landmarks, and a model-ready `context` string — over one
interface with two interchangeable backends:

- **Hosted** — a thin client for a NaviGraph deployment's `POST /api/context`.
- **Offline** — loads an exported bundle and runs localization → planning →
  context generation **entirely locally, with no network calls**.

The offline path produces **byte-identical `context` strings** to the hosted API
for the same graph and inputs (enforced by a cross-language parity test).

## Install

```bash
pip install navigraph                 # core: hosted client + offline planning + zero-vision
pip install "navigraph[onnx]"         # + local CLIP/DINOv2 image localization (onnxruntime)
```

The core has **no dependencies** and the zero-vision path needs **no model**.

## Zero-vision (recommended for robots with a pose estimate)

If your stack already knows which room the robot is in (from Nav2/AMCL, a QR tag,
etc.), pass it as `current_location` and skip localization entirely — no model,
no network:

```python
from navigraph import OfflineBackend

ng = OfflineBackend.from_file("building.navigraph.json")
res = ng.context("take me to the supply room", current_location="lobby")

print(res.context)
# You are in Lobby. Goal: reach Storage Room.
# Route: Lobby → Corridor → Storage Room (3 nodes, same floor).
# ...
print(res.path)          # ["Lobby", "Corridor", "Storage Room"]
print(res.destination)   # "Storage Room"
```

## Offline localization from a camera frame

Provide a local ONNX image encoder (export your CLIP or DINOv2 image tower to
ONNX). The bundle must have been embedded in a **matching space** — the backend
refuses to compare across incompatible spaces rather than return nonsense.

```python
from navigraph import OfflineBackend
from navigraph.embedding import OnnxImageEmbedder

ng = OfflineBackend.from_file(
    "building.navigraph.json",
    embedder=OnnxImageEmbedder("clip_image.onnx", dim=512),
)
res = ng.context("go to the supply room", image=open("frame.jpg", "rb").read())
```

## Hosted

```python
from navigraph import HostedBackend

ng = HostedBackend("https://navigraph.cloud", project_id="…", api_key="navi_…")
res = ng.context("go to the supply room", current_location="lobby")
```

Because both backends implement the same `context(...)` method, you can develop
against the hosted API and deploy offline (or vice-versa) without changing call
sites.

## Pluggable embedders

`OnnxImageEmbedder` (default, offline) and `OpenAIEmbedder` (opt-in, matches the
hosted text-embedding pipeline so it can localize hosted-exported bundles) ship
with the SDK. Any object with `space() -> EmbeddingSpace` and
`embed_query(image: bytes) -> list[float]` works.

## The bundle format

Bundles follow the public
[spatial-graph bundle format](https://github.com/lancelot2/NaviGraph/blob/main/docs/spatial-graph-format.md).
Export one from the NaviGraph dashboard ("Export bundle").

## License

Apache-2.0.
