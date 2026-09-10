import os
from glob import glob

from setuptools import find_packages, setup

package_name = "navigraph_ros"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
        (os.path.join("share", package_name, "launch"), glob("launch/*.launch.py")),
        (os.path.join("share", package_name, "examples"), glob("examples/*")),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="NaviGraph contributors",
    maintainer_email="conduct@navigraph.cloud",
    description="ROS 2 node exposing NaviGraph navigation context (offline bundle or hosted API).",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "context_node = navigraph_ros.context_node:main",
        ],
    },
)
