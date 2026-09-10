"""Opt-in OpenAI embedder that mirrors the hosted localization pipeline.

The hosted app localizes by turning a photo into scene *text* (via a vision
model) and embedding that text. This embedder reproduces exactly that, so it
can localize against bundles exported from the hosted app (embedding.modality
== "text", model "text-embedding-3-small"). It requires network access and an
OpenAI API key, so it is NOT part of the offline path — it is provided only for
parity with hosted localization when you opt in.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request
from typing import Optional

from ..bundle import EmbeddingSpace

_ANALYZE_SYSTEM = (
    "You analyse a single photo taken inside a room of a building.\n"
    "Return ONLY a JSON object with keys objects, landmarks, signs, synonyms, "
    "each a short array of strings. Use [] when nothing applies."
)


class OpenAIEmbedder:
    """Image -> scene text (vision) -> text embedding, matching hosted."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        model: str = "text-embedding-3-small",
        dim: int = 512,
        vision_model: str = "gpt-4o",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAIEmbedder requires an API key (OPENAI_API_KEY).")
        self.model = model
        self.dim = dim
        self.vision_model = vision_model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def space(self) -> EmbeddingSpace:
        return EmbeddingSpace(
            model=self.model, dim=self.dim, modality="text", metric="cosine"
        )

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
        )
        req.add_header("content-type", "application/json")
        req.add_header("authorization", f"Bearer {self.api_key}")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _analyze(self, image: bytes) -> dict:
        data_url = "data:image/jpeg;base64," + base64.b64encode(image).decode()
        payload = self._post(
            "/chat/completions",
            {
                "model": self.vision_model,
                "max_tokens": 1024,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _ANALYZE_SYSTEM},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Analyse this room photo as JSON."},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    },
                ],
            },
        )
        content = payload["choices"][0]["message"]["content"]
        return json.loads(content)

    def embed_query(self, image: bytes) -> list[float]:
        a = self._analyze(image)
        scene_text = ", ".join(
            s
            for s in (
                *a.get("objects", []),
                *a.get("landmarks", []),
                *a.get("signs", []),
                *a.get("synonyms", []),
            )
            if s
        )
        payload = self._post(
            "/embeddings",
            {"model": self.model, "input": scene_text, "dimensions": self.dim},
        )
        return list(payload["data"][0]["embedding"])
