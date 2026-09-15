"""Simple VLM room + adjacency detection (opt-in OpenAI).

Returns a clean room list + adjacency edges — NO coordinates, NO polygons — for
the app's left-panel graph. Independent from the coloured overlay (loose
coupling by design). Output matches the ExtractedGraphJSON node/edge shape the
web app already persists, so no app-side mapping changes are needed.
"""

from __future__ import annotations

import base64
import json
import math
import os
import urllib.request

_SYSTEM = (
    "You read a building floor plan image and list its ROOMS and which rooms are "
    "directly connected (a person can walk between them through a doorway or open "
    "passage, not via a third room). Return ONLY JSON: "
    '{"rooms": [{"id": int, "name": string, "type": one of '
    '["room","entrance","stair","elevator","landmark"]}], '
    '"edges": [[id_i, id_j], ...]}. '
    "One entry per real room (kitchen, each bedroom, garage, bath, closet, "
    "hallway, etc.); ignore furniture and dimension text. Sequential ids from 0."
)

_ALLOWED = {"room", "entrance", "stair", "elevator", "landmark"}


def detect_rooms(image_bytes: bytes, *, model: str | None = None, timeout: float = 90.0) -> dict:
    """Plan image bytes -> {"nodes": [...], "edges": [...]} (ExtractedGraphJSON shape)."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY not set")
    model = model or os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")

    data_url = "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
    body = {
        "model": model,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "List the rooms and their connections as JSON."},
                    {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                ],
            },
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read())
    parsed = json.loads(payload["choices"][0]["message"]["content"])

    rooms = parsed.get("rooms", []) or []
    cols = max(1, int(math.ceil(math.sqrt(max(1, len(rooms))))))
    nodes = []
    ids = set()
    for k, room in enumerate(rooms):
        rid = str(room.get("id", k))
        ids.add(rid)
        rtype = room.get("type")
        rtype = rtype if rtype in _ALLOWED else "room"
        # Grid centroid so nodes get a spread-out layout position (no real geometry).
        gx = ((k % cols) + 0.5) / cols
        gy = ((k // cols) + 0.5) / cols
        nodes.append({
            "id": rid, "kind": "space", "type": rtype,
            "label": room.get("name"), "confidence": 1.0,
            "polygon": [], "centroid": [gx, gy],
        })

    edges = []
    for e in parsed.get("edges", []) or []:
        if isinstance(e, (list, tuple)) and len(e) >= 2:
            a, b = str(e[0]), str(e[1])
            if a in ids and b in ids and a != b:
                edges.append({"source": a, "target": b, "certain": True, "weight": 1.0, "profiles": []})

    return {"nodes": nodes, "edges": edges}
