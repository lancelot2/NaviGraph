# NaviGraph ROS 2

A ROS 2 node that exposes NaviGraph navigation context to your robot. It wraps
the [`navigraph` Python SDK](../sdk/python) and works **offline from a bundle**
or against a **hosted** deployment.

Target distros: **Humble** and **Jazzy**.

## Packages

| Package | Type | What it is |
| --- | --- | --- |
| `navigraph_msgs` | ament_cmake | The `GetContext` service definition. |
| `navigraph_ros` | ament_python | The `context_node` node, launch file, and example. |

## Node: `context_node`

Interfaces (relative to the node namespace, default `/navigraph`):

| Kind | Name | Type | Purpose |
| --- | --- | --- | --- |
| Subscriber | *(param)* `image_topic` | `sensor_msgs/Image` | Latest camera frame for localization. |
| Service | `~/get_context` | `navigraph_msgs/GetContext` | Ask for context for an instruction. |
| Publisher | `~/context` | `std_msgs/String` | The latest context result as JSON. |
| Publisher | `~/plan` | `nav_msgs/Path` | The route in the map frame — **only when the bundle is georeferenced**. |

Key parameters: `backend` (`offline`/`hosted`), `bundle_path`, `image_topic`,
`default_current_location`, `embedder` (`none`/`onnx`/`openai`),
`onnx_model_path`, `embedding_dim`, and the hosted trio `api_base_url`,
`api_key`, `project_id`.

### Nav2 composition

When the loaded bundle carries a `georeference` (see the
[bundle format](../docs/spatial-graph-format.md)) and the nodes on a route have
plan outlines, the node publishes the route as a `nav_msgs/Path` in the
georeference's frame (e.g. `map`). That Path can feed a Nav2
`FollowPath`/waypoint follower, so NaviGraph composes with Nav2 rather than
sitting beside it. Without a georeference the graph is topological-only and only
the `~/context` topic and service are published.

## Build

```bash
# In a ROS 2 Humble or Jazzy environment:
mkdir -p ~/navigraph_ws/src
cp -r ros2/navigraph_msgs ros2/navigraph_ros ~/navigraph_ws/src/

# The node needs the Python SDK on the ROS Python path:
pip install navigraph            # or: pip install -e sdk/python
# For local image localization also: pip install "navigraph[onnx]"

cd ~/navigraph_ws
rosdep install --from-paths src --ignore-src -r -y
colcon build
source install/setup.bash
```

## Run the example

See [`navigraph_ros/examples/README.md`](navigraph_ros/examples/README.md) for a
full walkthrough against the checked-in sample bundle.

```bash
ros2 launch navigraph_ros navigraph.launch.py
```
