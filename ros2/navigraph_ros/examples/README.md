# navigraph_ros example

A runnable end-to-end example using the checked-in georeferenced sample bundle
[`sample_building.navigraph.json`](sample_building.navigraph.json). No camera,
no model, no network — the **zero-vision** path.

## 1. Launch the node

```bash
ros2 launch navigraph_ros navigraph.launch.py
```

This starts `context_node` with `backend:=offline` and the sample bundle. The
log line confirms `georeferenced=True`.

## 2. Call the service

Provide the starting room as `current_location` (as a robot would from its pose
estimate), and a natural-language goal:

```bash
ros2 service call /navigraph/get_context navigraph_msgs/srv/GetContext \
  "{instruction: 'take me to the supply room', current_location: 'lobby'}"
```

Response (abridged):

```yaml
ok: true
current_location: "Lobby"
destination: "Storage Room"
path: ["Lobby", "Corridor", "Storage Room"]
landmarks: ["Metal shelves"]
context: |
  You are in Lobby. Goal: reach Storage Room.
  Route: Lobby → Corridor → Storage Room (3 nodes, same floor).
  Step 1: From Lobby, proceed to Corridor.
  Step 2: From Corridor, proceed to Storage Room.
  Destination landmarks: Metal shelves, STORAGE.
  About Storage Room: Where cleaning and office supplies are kept.
```

## 3. Watch the context topic and the Path

```bash
ros2 topic echo /navigraph/context      # std_msgs/String (JSON) — updated per call
ros2 topic echo /navigraph/plan         # nav_msgs/Path in the "map" frame
```

Because the sample bundle is georeferenced, `~/plan` carries the route as metric
poses in `map` (Lobby ≈ (12.5, 20.0) m, etc.), ready to hand to a Nav2 waypoint
follower.

## Trying localization (optional)

Export your CLIP/DINOv2 image encoder to ONNX, produce a bundle embedded in the
**same** space, then:

```bash
ros2 launch navigraph_ros navigraph.launch.py \
    bundle_path:=/abs/path/building.navigraph.json \
    image_topic:=/camera/color/image_raw \
    embedder:=onnx onnx_model_path:=/abs/path/clip_image.onnx embedding_dim:=512
```

Now calls with an empty `current_location` localize from the latest camera frame.
