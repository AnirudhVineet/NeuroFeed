"""In-process pub/sub for ingestion status updates → SSE.

Phase-1 demo replacement for Upstash Redis. Each document_id gets a tiny asyncio queue
of status events; the SSE endpoint subscribes for the duration of a job.
"""
from __future__ import annotations

import asyncio
from typing import Any


_queues: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
_lock = asyncio.Lock()


async def subscribe(doc_id: str) -> asyncio.Queue[dict[str, Any]]:
    async with _lock:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        _queues.setdefault(doc_id, set()).add(q)
        return q


async def unsubscribe(doc_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
    async with _lock:
        if doc_id in _queues:
            _queues[doc_id].discard(q)
            if not _queues[doc_id]:
                _queues.pop(doc_id, None)


async def publish(doc_id: str, event: dict[str, Any]) -> None:
    async with _lock:
        subs = list(_queues.get(doc_id, set()))
    for q in subs:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # drop oldest, push newest
            try:
                q.get_nowait()
            except Exception:
                pass
            try:
                q.put_nowait(event)
            except Exception:
                pass
