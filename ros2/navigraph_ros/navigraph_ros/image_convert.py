"""Minimal sensor_msgs/Image -> encoded PNG bytes, without cv_bridge.

Only used on the localization path (when an embedder is configured), so numpy
and pillow — pulled in by ``navigraph[onnx]`` — are imported lazily here.
"""

from __future__ import annotations

import io


def ros_image_to_png_bytes(msg) -> bytes:
    """Encode a raw sensor_msgs/Image (rgb8/bgr8/mono8) to PNG bytes."""
    import numpy as np
    from PIL import Image

    h, w = msg.height, msg.width
    buf = np.frombuffer(bytes(msg.data), dtype=np.uint8)
    encoding = msg.encoding

    if encoding in ("rgb8", "bgr8"):
        arr = buf.reshape(h, w, 3)
        if encoding == "bgr8":
            arr = arr[:, :, ::-1]
    elif encoding == "mono8":
        arr = buf.reshape(h, w)
    else:
        raise ValueError(
            f"Unsupported image encoding {encoding!r}; expected rgb8, bgr8, or mono8."
        )

    out = io.BytesIO()
    Image.fromarray(arr).save(out, format="PNG")
    return out.getvalue()
