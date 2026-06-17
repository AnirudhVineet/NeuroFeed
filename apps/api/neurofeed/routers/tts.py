"""TTS endpoint with in-memory cache by (voice, text) hash."""
from __future__ import annotations

import asyncio
from collections import OrderedDict

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..services.tts import DEFAULT_VOICE, synth

router = APIRouter(prefix="/api/tts", tags=["tts"])


# Tiny LRU. Phase-2 swap: Supabase Storage with cache_key().
_CACHE: "OrderedDict[str, bytes]" = OrderedDict()
_CACHE_MAX = 256
_LOCK = asyncio.Lock()


class TTSIn(BaseModel):
    text: str = Field(..., max_length=2000)
    voice: str = DEFAULT_VOICE


@router.post("")
async def tts(req: TTSIn) -> Response:
    key = f"{req.voice}|{hash(req.text)}"
    async with _LOCK:
        cached = _CACHE.get(key)
        if cached is not None:
            _CACHE.move_to_end(key)
            return Response(content=cached, media_type="audio/mpeg")
    audio = await synth(req.text, req.voice)
    async with _LOCK:
        _CACHE[key] = audio
        _CACHE.move_to_end(key)
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return Response(content=audio, media_type="audio/mpeg")
