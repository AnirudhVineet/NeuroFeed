"""TTS for Tier-1 reels.

Day 6 uses edge-tts (free Microsoft Azure voices, no API key). Kokoro-82M can swap
in for Day 8 stretch by providing a synth_kokoro() that returns the same bytes.
"""
from __future__ import annotations

import hashlib
import io
from typing import Literal

VoiceId = Literal["en-US-AriaNeural", "en-US-GuyNeural", "en-GB-RyanNeural"]
DEFAULT_VOICE: VoiceId = "en-US-AriaNeural"


def cache_key(text: str, voice: str) -> str:
    h = hashlib.sha256(f"{voice}|{text}".encode("utf-8")).hexdigest()
    return f"tts/{voice}/{h}.mp3"


async def synth_edge(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    import edge_tts

    communicator = edge_tts.Communicate(text=text, voice=voice)
    buf = io.BytesIO()
    async for chunk in communicator.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    data = buf.getvalue()
    if not data:
        raise RuntimeError("edge-tts produced empty audio")
    return data


async def synth(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    """Single entry point. Today: edge-tts. Day 8 stretch: route to Kokoro."""
    return await synth_edge(text, voice)
