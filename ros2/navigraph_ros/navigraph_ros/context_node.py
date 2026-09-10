"""navigraph_ros context node.

Wraps the NaviGraph SDK and exposes navigation context to a ROS 2 graph:

  * subscribes to a ``sensor_msgs/Image`` topic (optional localization input),
  * serves ``navigraph_msgs/GetContext`` on ``~/get_context``,
  * publishes the latest context as ``std_msgs/String`` (JSON) on ``~/context``,
  * publishes the planned route as ``nav_msgs/Path`` on ``~/plan`` when the
    bundle is georeferenced, so it composes with Nav2.

Backends and embedders are selected by parameter, so the same node runs fully
offline from a bundle or against a hosted deployment.
"""

from __future__ import annotations

import json
from typing import Optional

import rclpy
from rclpy.node import Node

from geometry_msgs.msg import PoseStamped
from nav_msgs.msg import Path
from sensor_msgs.msg import Image
from std_msgs.msg import String

from navigraph_msgs.srv import GetContext

from .geo import plan_to_map_points
from .image_convert import ros_image_to_png_bytes


class NaviGraphNode(Node):
    def __init__(self) -> None:
        super().__init__("navigraph")

        # --- parameters -----------------------------------------------------
        self.declare_parameter("backend", "offline")  # "offline" | "hosted"
        self.declare_parameter("bundle_path", "")
        self.declare_parameter("image_topic", "/camera/image_raw")
        self.declare_parameter("default_current_location", "")
        # embedder: "none" (zero-vision) | "onnx" | "openai"
        self.declare_parameter("embedder", "none")
        self.declare_parameter("onnx_model_path", "")
        self.declare_parameter("embedding_dim", 512)
        self.declare_parameter("embedding_model", "clip-vit-b-32")
        # hosted backend
        self.declare_parameter("api_base_url", "https://navigraph.cloud")
        self.declare_parameter("api_key", "")
        self.declare_parameter("project_id", "")

        self._backend_kind = self.get_parameter("backend").value
        self._default_location = (
            self.get_parameter("default_current_location").value or None
        )
        self._latest_image: Optional[Image] = None

        self._embedder = self._build_embedder()
        self._backend, self._bundle = self._build_backend()

        # --- interfaces -----------------------------------------------------
        image_topic = self.get_parameter("image_topic").value
        self.create_subscription(Image, image_topic, self._on_image, 10)
        self._context_pub = self.create_publisher(String, "~/context", 10)
        self._path_pub = self.create_publisher(Path, "~/plan", 10)
        self._srv = self.create_service(
            GetContext, "~/get_context", self._on_get_context
        )

        self.get_logger().info(
            f"navigraph node up: backend={self._backend_kind}, "
            f"embedder={self.get_parameter('embedder').value}, "
            f"image_topic={image_topic}, "
            f"georeferenced={bool(self._bundle and self._bundle.georeference)}"
        )

    # --- construction -------------------------------------------------------

    def _build_embedder(self):
        kind = self.get_parameter("embedder").value
        if kind == "none":
            return None
        if kind == "onnx":
            from navigraph.embedding import OnnxImageEmbedder

            model_path = self.get_parameter("onnx_model_path").value
            if not model_path:
                raise ValueError("embedder=onnx requires onnx_model_path")
            return OnnxImageEmbedder(
                model_path,
                dim=int(self.get_parameter("embedding_dim").value),
                model=self.get_parameter("embedding_model").value,
            )
        if kind == "openai":
            from navigraph.embedding import OpenAIEmbedder

            return OpenAIEmbedder(self.get_parameter("api_key").value or None)
        raise ValueError(f"Unknown embedder {kind!r}")

    def _build_backend(self):
        if self._backend_kind == "offline":
            from navigraph import OfflineBackend

            bundle_path = self.get_parameter("bundle_path").value
            if not bundle_path:
                raise ValueError("backend=offline requires bundle_path")
            backend = OfflineBackend.from_file(bundle_path, embedder=self._embedder)
            return backend, backend.bundle
        if self._backend_kind == "hosted":
            from navigraph import HostedBackend

            backend = HostedBackend(
                self.get_parameter("api_base_url").value,
                self.get_parameter("project_id").value,
                self.get_parameter("api_key").value or None,
            )
            return backend, None
        raise ValueError(f"Unknown backend {self._backend_kind!r}")

    # --- callbacks ----------------------------------------------------------

    def _on_image(self, msg: Image) -> None:
        self._latest_image = msg

    def _on_get_context(
        self, request: GetContext.Request, response: GetContext.Response
    ) -> GetContext.Response:
        image = None
        if self._embedder is not None and self._latest_image is not None:
            try:
                image = ros_image_to_png_bytes(self._latest_image)
            except Exception as exc:  # noqa: BLE001 - never fail the whole call
                self.get_logger().warn(f"Image conversion failed: {exc}")

        current_location = request.current_location or self._default_location

        try:
            result = self._backend.context(
                request.instruction,
                image=image,
                current_location=current_location,
            )
        except Exception as exc:  # noqa: BLE001
            self.get_logger().error(f"Context request failed: {exc}")
            response.ok = False
            response.context = f"Context request failed: {exc}"
            return response

        response.ok = True
        response.current_location = result.current_location or ""
        response.destination = result.destination or ""
        response.path = list(result.path)
        response.landmarks = list(result.landmarks)
        response.context = result.context

        self._publish_context(result)
        self._publish_plan(result)
        return response

    # --- publishers ---------------------------------------------------------

    def _publish_context(self, result) -> None:
        self._context_pub.publish(String(data=json.dumps(result.to_dict())))

    def _publish_plan(self, result) -> None:
        if self._bundle is None or not result.path:
            return
        points = plan_to_map_points(self._bundle, result.path)
        if not points:
            return  # topological-only graph, or a node without geometry

        path = Path()
        path.header.frame_id = self._bundle.georeference["frame_id"]
        path.header.stamp = self.get_clock().now().to_msg()
        for x, y in points:
            pose = PoseStamped()
            pose.header = path.header
            pose.pose.position.x = float(x)
            pose.pose.position.y = float(y)
            pose.pose.orientation.w = 1.0
            path.poses.append(pose)
        self._path_pub.publish(path)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = NaviGraphNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
