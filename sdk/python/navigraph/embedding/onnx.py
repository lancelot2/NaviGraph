"""Local, offline image embedder backed by an ONNX model (CLIP / DINOv2).

This is the default offline embedder: it runs entirely on-device via
onnxruntime, so no network is involved. The model file is supplied by the
caller (export your CLIP/DINOv2 image encoder to ONNX). Heavy dependencies
(onnxruntime, numpy, pillow) are imported lazily so importing the package — and
using the zero-vision path — never requires them.

Install with the extra:  pip install "navigraph[onnx]"
"""

from __future__ import annotations

import io
from typing import Optional, Sequence

from ..bundle import EmbeddingSpace

# Standard CLIP normalization; override for other encoders.
CLIP_MEAN = (0.48145466, 0.45782750, 0.40821073)
CLIP_STD = (0.26862954, 0.26130258, 0.27577711)


class OnnxImageEmbedder:
    """Embeds a camera frame with an ONNX image encoder (image modality)."""

    def __init__(
        self,
        model_path: str,
        dim: int,
        *,
        model: str = "clip-vit-b-32",
        input_size: int = 224,
        mean: Sequence[float] = CLIP_MEAN,
        std: Sequence[float] = CLIP_STD,
        input_name: Optional[str] = None,
        normalize: bool = True,
    ) -> None:
        self.model_path = model_path
        self.dim = dim
        self.model = model
        self.input_size = input_size
        self.mean = tuple(mean)
        self.std = tuple(std)
        self.input_name = input_name
        self.normalize = normalize
        self._session = None  # lazily created

    def space(self) -> EmbeddingSpace:
        return EmbeddingSpace(
            model=self.model, dim=self.dim, modality="image", metric="cosine"
        )

    def _ensure_session(self):
        if self._session is None:
            import onnxruntime as ort  # lazy

            self._session = ort.InferenceSession(
                self.model_path, providers=["CPUExecutionProvider"]
            )
            if self.input_name is None:
                self.input_name = self._session.get_inputs()[0].name
        return self._session

    def embed_query(self, image: bytes) -> list[float]:
        import numpy as np  # lazy
        from PIL import Image  # lazy

        session = self._ensure_session()

        img = Image.open(io.BytesIO(image)).convert("RGB")
        img = img.resize((self.input_size, self.input_size), Image.BICUBIC)
        arr = np.asarray(img, dtype=np.float32) / 255.0  # HWC in [0,1]
        mean = np.array(self.mean, dtype=np.float32)
        std = np.array(self.std, dtype=np.float32)
        arr = (arr - mean) / std
        arr = np.transpose(arr, (2, 0, 1))[None, :, :, :]  # 1CHW

        outputs = session.run(None, {self.input_name: arr})
        vec = np.asarray(outputs[0], dtype=np.float32).reshape(-1)

        if vec.shape[0] != self.dim:
            raise ValueError(
                f"ONNX model produced dim {vec.shape[0]}, expected {self.dim}"
            )
        if self.normalize:
            norm = float(np.linalg.norm(vec)) or 1.0
            vec = vec / norm
        return vec.tolist()
