"""Hosted backend: a thin client for POST /api/context."""

from __future__ import annotations

import base64
import json
import urllib.request
from typing import Optional, Union

from ..types import ContextResult


class HostedBackend:
    """Calls a NaviGraph deployment's context endpoint.

    Uses only the standard library so the hosted path has no dependencies.
    """

    def __init__(
        self,
        base_url: str,
        project_id: str,
        api_key: Optional[str] = None,
        *,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self.api_key = api_key
        self.timeout = timeout

    def context(
        self,
        instruction: str,
        *,
        image: Optional[Union[bytes, str]] = None,
        current_location: Optional[str] = None,
    ) -> ContextResult:
        body: dict = {"projectId": self.project_id, "instruction": instruction}
        if image is not None:
            # The endpoint accepts a data URL or bare base64; bytes are encoded.
            body["image"] = (
                image
                if isinstance(image, str)
                else base64.b64encode(image).decode("ascii")
            )
        if current_location is not None:
            body["current_location"] = current_location

        req = urllib.request.Request(
            self.base_url + "/api/context",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
        )
        req.add_header("content-type", "application/json")
        if self.api_key:
            req.add_header("authorization", f"Bearer {self.api_key}")

        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

        if "error" in payload and "context" not in payload:
            raise RuntimeError(f"Context request failed: {payload['error']}")
        return ContextResult.from_dict(payload)
