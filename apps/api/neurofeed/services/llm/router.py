"""Provider routing. Groq is currently the only configured provider; this stays
a thin indirection so a second provider can be reintroduced later without
touching call sites in actions.py / llm.py / generate.py.
"""
from __future__ import annotations

from typing import Any, Literal

from ...config import get_settings
from .groq import groq_client


Provider = Literal["groq"]


def route_client(human_waiting: bool) -> tuple[Any | None, Provider]:
    """Return (client, provider_name).

    Caller must handle the case where client is None (provider unconfigured).
    """
    return groq_client(), "groq"


def fallback_client(current: Provider) -> tuple[Any | None, Provider]:
    """No secondary provider configured; nothing to fall back to."""
    return None, current


def model_for(provider: Provider, *, reasoning: bool = False) -> str:
    s = get_settings()
    return s.groq_reasoning_model if reasoning else s.groq_chat_model
