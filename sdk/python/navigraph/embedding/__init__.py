"""Pluggable embedding backends for offline localization."""

from __future__ import annotations

from ..bundle import EmbeddingSpace
from .base import Embedder, cosine_similarity
from .onnx import OnnxImageEmbedder
from .openai import OpenAIEmbedder

__all__ = [
    "Embedder",
    "EmbeddingSpace",
    "cosine_similarity",
    "OnnxImageEmbedder",
    "OpenAIEmbedder",
]
