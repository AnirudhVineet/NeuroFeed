"""Provider routing per build prompt:
- Human waiting on response NOW → Groq (fast, ~30 RPM).
- Background batch / no human waiting → Featherless (unlimited tokens, 4-wide pool).
On Groq 429 (or missing key), fall back to Featherless mid-stream.
"""
from __future__ import annotations

from typing import Any, Literal

from ...config import get_settings
from .featherless import featherless_client
from .groq import groq_client


Provider = Literal["groq", "featherless"]


def route_client(human_waiting: bool) -> tuple[Any | None, Provider]:
    """Return (client, provider_name) for the requested mode.

    Caller must handle the case where client is None (provider unconfigured)
    and may fall back via `fallback_client`.
    """
    if human_waiting:
        client = groq_client()
        if client is not None:
            return client, "groq"
        return featherless_client(), "featherless"

    client = featherless_client()
    if client is not None:
        return client, "featherless"
    return groq_client(), "groq"


def fallback_client(current: Provider) -> tuple[Any | None, Provider]:
    other: Provider = "featherless" if current == "groq" else "groq"
    if other == "featherless":
        return featherless_client(), other
    return groq_client(), other


def model_for(provider: Provider, *, reasoning: bool = False) -> str:
    s = get_settings()
    if provider == "groq":
        return s.groq_reasoning_model if reasoning else s.groq_chat_model
    return s.featherless_model
