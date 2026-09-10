# NaviGraph examples

Runnable, self-contained examples built on a checked-in sample building.

| File | What it is |
| --- | --- |
| [`sample_floorplan.png`](sample_floorplan.png) | A sample floor plan (the kind you'd upload to build a graph). |
| [`sample_building.navigraph.json`](sample_building.navigraph.json) | An exported, **georeferenced** bundle for that building (zero-vision: no embeddings). |
| [`quickstart.py`](quickstart.py) | Offline SDK: load the bundle, generate context, no network/model. |
| [`curl_hosted.sh`](curl_hosted.sh) | Query a hosted/self-hosted deployment's `/api/context`. |

## Offline (no network, no model)

```bash
pip install navigraph          # or: pip install -e ../sdk/python
python quickstart.py
```

Expected output:

```
current_location: Lobby
destination:      Storage Room
path:             Lobby -> Corridor -> Storage Room
landmarks:        Metal shelves

--- context ---
You are in Lobby. Goal: reach Storage Room.
Route: Lobby → Corridor → Storage Room (3 nodes, same floor).
Step 1: From Lobby, proceed to Corridor.
Step 2: From Corridor, proceed to Storage Room.
Destination landmarks: Metal shelves, STORAGE.
About Storage Room: Where cleaning and office supplies are kept.
```

## ROS 2

The same bundle drives the ROS 2 node — see
[`../ros2/navigraph_ros/examples`](../ros2/navigraph_ros/examples/README.md).

## Hosted API

```bash
BASE_URL=https://navigraph.cloud PROJECT_ID=... API_KEY=navi_... ./curl_hosted.sh
```

The `context` string is **byte-identical** to what `quickstart.py` prints for the
same graph and inputs — that's the parity contract between the hosted and
offline paths.
