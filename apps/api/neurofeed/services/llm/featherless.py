"""Featherless client wrapper. Build prompt: max 4 concurrent — must queue."""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

from openai import AsyncOpenAI

from ...config import get_settings


@lru_cache
def _raw_client() -> AsyncOpenAI | None:
    s = get_settings()
    if not s.featherless_api_key:
        return None
    return AsyncOpenAI(api_key=s.featherless_api_key, base_url=s.featherless_base_url)


@lru_cache
def _semaphore() -> asyncio.Semaphore:
    return asyncio.Semaphore(get_settings().featherless_max_concurrency)


class FeatherlessClient:
    """Wraps AsyncOpenAI so every chat.completions.create call passes through the semaphore.

    Mirrors the AsyncOpenAI surface we use (`.chat.completions.create`) so the rest of the
    codebase can treat it like the Groq client.
    """

    def __init__(self, inner: AsyncOpenAI):
        self._inner = inner
        self.chat = _ChatNamespace(inner, _semaphore())


class _ChatNamespace:
    def __init__(self, inner: AsyncOpenAI, sem: asyncio.Semaphore):
        self.completions = _CompletionsNamespace(inner, sem)


class _CompletionsNamespace:
    def __init__(self, inner: AsyncOpenAI, sem: asyncio.Semaphore):
        self._inner = inner
        self._sem = sem

    async def create(self, **kwargs: Any):
        async with self._sem:
            return await self._inner.chat.completions.create(**kwargs)


def featherless_client() -> FeatherlessClient | None:
    raw = _raw_client()
    if raw is None:
        return None
    return FeatherlessClient(raw)
