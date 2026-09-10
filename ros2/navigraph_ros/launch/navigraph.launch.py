"""Launch the navigraph context node against a bundle (defaults to the sample).

Examples:

  # Zero-vision, sample bundle, tell it the starting room per request:
  ros2 launch navigraph_ros navigraph.launch.py

  # Your own bundle + a camera topic + local ONNX localization:
  ros2 launch navigraph_ros navigraph.launch.py \\
      bundle_path:=/abs/path/building.navigraph.json \\
      image_topic:=/camera/color/image_raw \\
      embedder:=onnx onnx_model_path:=/abs/path/clip_image.onnx
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description() -> LaunchDescription:
    default_bundle = PathJoinSubstitution(
        [FindPackageShare("navigraph_ros"), "examples", "sample_building.navigraph.json"]
    )

    args = [
        DeclareLaunchArgument("backend", default_value="offline"),
        DeclareLaunchArgument("bundle_path", default_value=default_bundle),
        DeclareLaunchArgument("image_topic", default_value="/camera/image_raw"),
        DeclareLaunchArgument("default_current_location", default_value=""),
        DeclareLaunchArgument("embedder", default_value="none"),
        DeclareLaunchArgument("onnx_model_path", default_value=""),
        DeclareLaunchArgument("embedding_dim", default_value="512"),
        DeclareLaunchArgument("embedding_model", default_value="clip-vit-b-32"),
        DeclareLaunchArgument("api_base_url", default_value="https://navigraph.cloud"),
        DeclareLaunchArgument("api_key", default_value=""),
        DeclareLaunchArgument("project_id", default_value=""),
    ]

    node = Node(
        package="navigraph_ros",
        executable="context_node",
        name="navigraph",
        output="screen",
        parameters=[
            {
                "backend": LaunchConfiguration("backend"),
                "bundle_path": LaunchConfiguration("bundle_path"),
                "image_topic": LaunchConfiguration("image_topic"),
                "default_current_location": LaunchConfiguration("default_current_location"),
                "embedder": LaunchConfiguration("embedder"),
                "onnx_model_path": LaunchConfiguration("onnx_model_path"),
                "embedding_dim": ParameterValue(
                    LaunchConfiguration("embedding_dim"), value_type=int
                ),
                "embedding_model": LaunchConfiguration("embedding_model"),
                "api_base_url": LaunchConfiguration("api_base_url"),
                "api_key": LaunchConfiguration("api_key"),
                "project_id": LaunchConfiguration("project_id"),
            }
        ],
    )

    return LaunchDescription([*args, node])
