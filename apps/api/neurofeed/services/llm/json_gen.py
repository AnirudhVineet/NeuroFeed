"""Strict-JSON generation with single retry on parse failure (build prompt: Day 1)."""
from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from .router import model_for

log = logging.getLogger(__name__)

_STRICT_TAIL = (
    "\n\nReturn JSON only. No prose. No markdown fences. Match the schema exactly."
)


def _extract_json(text: str) -> Any:
    """Tolerate stray fences/whitespace, then json.loads."""
    s = text.strip()
    if s.startswith("```"):
        # strip ```json ... ```
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:].lstrip()
        # in case there's a trailing ```
        if s.endswith("```"):
            s = s[:-3]
    # if model wrapped object in extra prose, grab outermost {...} or [...]
    first = min((i for i in [s.find("{"), s.find("[")] if i != -1), default=-1)
    last = max(s.rfind("}"), s.rfind("]"))
    if first != -1 and last != -1 and last > first:
        s = s[first : last + 1]
    return json.loads(s)


async def generate_json(
    *,
    client: Any,
    system: str,
    user: str,
    schema_keys: Iterable[str] | None = None,
    model: str | None = None,
    provider: str = "groq",
    temperature: float = 0.2,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    """Run one chat completion; ensure strict JSON; retry once on parse failure."""
    mdl = model or model_for(provider)  # type: ignore[arg-type]
    sys_msg = system if system.rstrip().endswith(_STRICT_TAIL.strip()) else system + _STRICT_TAIL

    async def _call(extra_user: str = "") -> str:
        messages = [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user + extra_user},
        ]
        resp = await client.chat.completions.create(
            model=mdl,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    raw = await _call()
    try:
        data = _extract_json(raw)
    except Exception as e1:
        log.warning("json_gen parse failed once; retrying. err=%s raw=%s", e1, raw[:300])
        raw2 = await _call(
            extra_user=f"\n\nYour previous output failed JSON parse: {e1}. "
            "Output valid JSON only.",
        )
        data = _extract_json(raw2)

    if schema_keys:
        missing = [k for k in schema_keys if k not in data]
        if missing:
            raise ValueError(f"missing keys in JSON: {missing}")
    if not isinstance(data, dict):
        raise ValueError("expected JSON object at top level")
    return data
