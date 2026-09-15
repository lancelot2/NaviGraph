"""Narrated video walkthrough -> spatial graph (opt-in OpenAI: Whisper + GPT).

Transcribes the narrated video with Whisper, then extracts rooms + per-room
objects + connections from the transcript and key frames with a vision model.
Returns the same ExtractedGraphJSON shape the web app persists (reusing
saveExtractedGraph), plus per-room `objects`. There is no floor plan, so nodes
carry no polygon; positions are a spaced grid the user can rearrange.
"""

from __future__ import annotations

import base64
import json
import math
import os
import urllib.request
import uuid
from typing import Any

_WHISPER_MODEL = "whisper-1"
_ALLOWED = {"room", "entrance", "stair", "elevator", "landmark"}

_SYSTEM = (
    "You analyse a narrated walkthrough video of a home. From the spoken "
    "TRANSCRIPT and the KEY FRAMES, produce the home's spatial graph. Return ONLY "
    'JSON: {"rooms":[{"id":int,"name":string,"type":one of '
    '["room","entrance","stair","elevator","landmark"],"objects":[string]}],'
    '"edges":[[id_i,id_j],...]}. '
    "One entry per real room the person visits or mentions; objects = notable "
    "items visible or mentioned in that room. edges = pairs of rooms directly "
    "connected (a doorway/opening walked through). Do not invent rooms. Use the "
    "SAME language as the narration for names and objects. Sequential ids from 0."
)


def _post_multipart(url: str, token: str, filename: str, file_bytes: bytes, fields: dict) -> dict:
    boundary = uuid.uuid4().hex
    body = bytearray()
    for k, v in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
        ).encode("utf-8")
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    body += file_bytes
    body += f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        url,
        data=bytes(body),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read())


def _transcribe(video_bytes: bytes, filename: str, token: str) -> str:
    # Best-effort: a Whisper hiccup should not lose the whole analysis; the
    # vision pass can still work from the key frames alone.
    try:
        out = _post_multipart(
            "https://api.openai.com/v1/audio/transcriptions",
            token,
            filename or "walkthrough.webm",
            video_bytes,
            {"model": _WHISPER_MODEL},
        )
        return out.get("text", "") or ""
    except Exception as e:  # noqa: BLE001
        print("whisper transcription failed:", e)
        return ""


def _analyze(transcript: str, keyframes: list[bytes], token: str, model: str) -> dict:
    content: list[dict[str, Any]] = [
        {"type": "text", "text": f'TRANSCRIPT:\n"""\n{transcript}\n"""\n\nKEY FRAMES:'}
    ]
    for img in keyframes:
        if not img:
            continue
        mime = "image/png" if img[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        url = f"data:{mime};base64," + base64.b64encode(img).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": url}})

    body = {
        "model": model,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": content},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        payload = json.loads(resp.read())
    return json.loads(payload["choices"][0]["message"]["content"])


def analyze_walkthrough(video_bytes: bytes, filename: str, keyframes: list[bytes]) -> dict:
    """(video, key-frame image bytes) -> {"nodes","edges","transcript"} (ExtractedGraphJSON shape)."""
    token = os.environ.get("OPENAI_API_KEY")
    if not token:
        raise ValueError("OPENAI_API_KEY not set")
    model = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")

    transcript = _transcribe(video_bytes, filename, token) if video_bytes else ""
    parsed = _analyze(transcript, keyframes or [], token, model)

    rooms = parsed.get("rooms", []) or []
    cols = max(3, int(math.ceil(math.sqrt(max(1, len(rooms))))))
    COL_W, ROW_H = 300, 250
    nodes = []
    ids = set()
    for k, room in enumerate(rooms):
        rid = str(room.get("id", k))
        ids.add(rid)
        rtype = room.get("type")
        rtype = rtype if rtype in _ALLOWED else "room"
        objects = [str(o) for o in (room.get("objects") or []) if o]
        gx = ((k % cols) * COL_W + 40) / 800.0
        gy = ((k // cols) * ROW_H + 40) / 600.0
        nodes.append({
            "id": rid, "kind": "space", "type": rtype,
            "label": room.get("name"), "confidence": 1.0,
            "polygon": [], "centroid": [gx, gy], "objects": objects,
        })

    edges = []
    for e in parsed.get("edges", []) or []:
        if isinstance(e, (list, tuple)) and len(e) >= 2:
            a, b = str(e[0]), str(e[1])
            if a in ids and b in ids and a != b:
                edges.append({"source": a, "target": b, "certain": True, "weight": 1.0, "profiles": []})

    return {"nodes": nodes, "edges": edges, "transcript": transcript}
