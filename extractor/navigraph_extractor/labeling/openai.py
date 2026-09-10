"""Opt-in OpenAI labeler. Network-bound; never required (mock covers logic/tests).

Regions: one call for the whole plan on the numbered/outlined image, returning
[{region_id, label, confidence}] — no coordinates. Passages: one call per
vignette, classifying into the five PassageType values.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request
from typing import Optional

import cv2
import numpy as np

from .base import Labeler, PassageLabel, PassageType, RegionLabel

_REGION_SYSTEM = (
    "You label the rooms of a building floor plan. The image shows each region "
    "outlined in color with a number at its center. Return ONLY a JSON object "
    '{"labels": [{"region_id": int, "label": string, "confidence": number}]} '
    "with one entry per visible number. Never return coordinates or polygons."
)
_PASSAGE_SYSTEM = (
    "You classify a small crop of a building floor plan showing a possible "
    "opening between two spaces. Return ONLY JSON "
    '{"type": one of ["door","entrance_door","window","opening","false_positive"], '
    '"confidence": number}. Use "false_positive" if there is no real opening.'
)


def _data_url(image: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("Failed to encode image for labeling.")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


class OpenAILabeler(Labeler):
    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        model: str = "gpt-4o",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 60.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAILabeler requires an API key (OPENAI_API_KEY).")
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _chat(self, system: str, image: np.ndarray, user: str) -> dict:
        body = {
            "model": self.model,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": _data_url(image)}},
                    ],
                },
            ],
        }
        req = urllib.request.Request(
            self.base_url + "/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
        )
        req.add_header("content-type", "application/json")
        req.add_header("authorization", f"Bearer {self.api_key}")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return json.loads(payload["choices"][0]["message"]["content"])

    def label_regions(
        self, annotated_image: np.ndarray, region_ids: list[int]
    ) -> list[RegionLabel]:
        data = self._chat(_REGION_SYSTEM, annotated_image, "Label every numbered region.")
        out: list[RegionLabel] = []
        for item in data.get("labels", []):
            out.append(
                RegionLabel(
                    region_id=int(item["region_id"]),
                    label=str(item.get("label", "")),
                    confidence=float(item.get("confidence", 0.0)),
                )
            )
        return out

    def label_region_crop(
        self, crop_image: np.ndarray, region_id: int
    ) -> RegionLabel:
        data = self._chat(
            "Name this single room from the crop. Return ONLY JSON "
            '{"label": string, "confidence": number}.',
            crop_image,
            "What room is this?",
        )
        return RegionLabel(
            region_id=region_id,
            label=str(data.get("label", "")),
            confidence=float(data.get("confidence", 0.0)),
        )

    def label_passage(
        self, thumbnail: Optional[np.ndarray], passage_id: int
    ) -> PassageLabel:
        if thumbnail is None or thumbnail.size == 0:
            return PassageLabel(passage_id, PassageType.FALSE_POSITIVE, 0.0)
        data = self._chat(_PASSAGE_SYSTEM, thumbnail, "Classify this opening.")
        try:
            ptype = PassageType(str(data.get("type", "false_positive")))
        except ValueError:
            ptype = PassageType.FALSE_POSITIVE
        return PassageLabel(passage_id, ptype, float(data.get("confidence", 0.0)))
