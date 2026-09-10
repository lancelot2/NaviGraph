# NaviGraph

Turn a building's floor plan into a portable **spatial graph**, then get a
plain-text **navigation context** — current location, destination, planned
route, and landmarks — for any navigation model. Runs as a hosted API *or*
**fully offline** from a single exported file, with no cloud round-trip in your
navigation loop.

<!-- Replace with a real capture: builder → export bundle → robot querying context offline. -->
![NaviGraph demo](docs/demo.gif)

> _Placeholder GIF — drop a real recording at `docs/demo.gif`._

Apache-2.0 · Python SDK · ROS 2 (Humble/Jazzy) · self-hostable

---

## For robotics engineers

You do not need to call a cloud API inside the navigation loop. Build the graph
once (hosted app or self-hosted), **export a bundle**, and run localization,
planning, and context generation locally in Python or ROS 2. The offline path
produces **byte-identical `context` strings** to the hosted API for the same
graph and inputs — enforced by a cross-language parity test — so you can develop
against the hosted API and deploy offline without surprises.

If your stack already knows the robot's room (Nav2/AMCL, a tag, etc.), the
**zero-vision** path needs no model at all.

## `pip install` — offline SDK

```bash
pip install navigraph                 # core: offline planning + context, zero-vision
pip install "navigraph[onnx]"         # + local CLIP/DINOv2 image localization
```

```python
from navigraph import OfflineBackend

ng = OfflineBackend.from_file("building.navigraph.json")
res = ng.context("take me to the supply room", current_location="lobby")
print(res.path)      # ['Lobby', 'Corridor', 'Storage Room']
print(res.context)   # model-ready plain-text brief
```

Runnable end-to-end example (checked-in floor plan + bundle):
[`examples/`](examples/). SDK docs: [`sdk/python`](sdk/python).

## ROS 2 — Humble & Jazzy

A node wraps the SDK: it subscribes to a `sensor_msgs/Image` topic, serves
context on a `navigraph_msgs/GetContext` service and a `std_msgs/String` topic,
and — when the bundle is georeferenced — publishes the route as a
`nav_msgs/Path` in the map frame, so it composes with Nav2.

```bash
ros2 launch navigraph_ros navigraph.launch.py
ros2 service call /navigraph/get_context navigraph_msgs/srv/GetContext \
  "{instruction: 'go to the supply room', current_location: 'lobby'}"
```

Full walkthrough: [`ros2/`](ros2/).

## Self-host — one command (no OpenAI key)

Runs the app **and** a local Supabase (Postgres + pgvector, Auth, Storage):

```bash
cd docker && cp .env.example .env && docker compose up --build
# app → http://localhost:3000
```

Details: [`docker/`](docker/). For local development without Docker, see
[Local development](#local-development).

## How it works

1. **Builder** — upload a plan; the vision layer extracts rooms, doors, stairs
   and elevators into an editable spatial graph.
2. **Knowledge** — name rooms, fix connections, add photos; each place gains
   landmarks/tags and a reference embedding.
3. **Export** — download a single versioned bundle (graph + embeddings). Public
   format spec: [`docs/spatial-graph-format.md`](docs/spatial-graph-format.md).
4. **Run** — localize → plan → generate context, hosted or offline.

## Hosted app

A free hosted build runs at **[navigraph.cloud](https://navigraph.cloud)**:
create an account, upload a plan, enrich the graph, generate API keys, and
export bundles — no setup, no billing.

## Local development

```bash
npm install
cp .env.example .env.local   # defaults: local Supabase + mock vision (no key)
supabase start               # applies supabase/migrations/
npm run dev
```

`VISION_PROVIDER=mock` (the default) runs the whole app end-to-end with no
OpenAI key. Set `VISION_PROVIDER=openai` + `OPENAI_API_KEY` for real vision.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Publishable/anon key (browser-safe) |
| `VISION_PROVIDER` | no | `mock` (default) or `openai` |
| `OPENAI_API_KEY` | if `openai` | Server-side secret |
| `OPENAI_VISION_MODEL` | no | Defaults to `gpt-4o` |

## API reference

### `POST /api/context`

```bash
curl -X POST https://navigraph.cloud/api/context \
  -H "Authorization: Bearer navi_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "instruction": "Go to the supply room",
    "current_location": "lobby"
  }'
```

**Request**

| Field | Required | Description |
| --- | --- | --- |
| `projectId` | yes | Building id from the project URL `/projects/<projectId>`. |
| `instruction` | yes | Natural-language goal. |
| `image` | no | Base64 camera frame (data URL or bare) for localization. |
| `current_location` | no | Room name/id; skips image localization (zero-vision). |

**Response**

```json
{
  "current_location": "Lobby",
  "destination": "Storage Room",
  "path": ["Lobby", "Corridor", "Storage Room"],
  "landmarks": ["Metal shelves"],
  "context": "You are in Lobby. Goal: reach Storage Room.\n..."
}
```

Auth: `Authorization: Bearer <api-key>` for external clients (generate keys at
`/dashboard/api`), or the app session for the in-app console.

### `GET /api/projects/:projectId/export`

Session-authenticated. Returns the downloadable spatial-graph bundle
([format](docs/spatial-graph-format.md)) for your own project.

## Repository layout

| Path | What |
| --- | --- |
| `src/`, `app/` | Next.js web app + `/api/context` |
| `supabase/` | Database schema & migrations |
| `sdk/python/` | The `navigraph` Python SDK |
| `ros2/` | The `navigraph_ros` ROS 2 packages |
| `docker/` | One-command self-host |
| `docs/` | Public specifications |
| `examples/` | Runnable end-to-end example |

## License

[Apache-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
