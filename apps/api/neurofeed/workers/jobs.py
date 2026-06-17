"""Background jobs. parse_job ties parse → chunk → embed → DB writes."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..deps import get_supabase_admin
from ..services.chunk import chunk as chunker
from ..services.embed import embed_texts
from ..services.parse import Block, parse as parse_doc, SourceType
from . import bus

log = logging.getLogger(__name__)


async def _set_status(doc_id: str, status: str, *, error: str | None = None) -> None:
    sb = get_supabase_admin()
    payload: dict[str, Any] = {"status": status}
    if error is not None:
        payload["error"] = error
    if sb is not None:
        try:
            sb.table("documents").update(payload).eq("id", doc_id).execute()
        except Exception:
            log.exception("supabase status update failed (doc=%s status=%s)", doc_id, status)
    await bus.publish(doc_id, {"status": status, "error": error})


async def _download(storage_path: str) -> bytes:
    sb = get_supabase_admin()
    if sb is None:
        raise RuntimeError("Supabase admin client not configured")
    # storage_path is "bucket/key" → split
    bucket, _, key = storage_path.partition("/")
    if not key:
        raise ValueError(f"storage_path must be 'bucket/key', got {storage_path!r}")
    return sb.storage.from_(bucket).download(key)


def _bytes_for_chunk_insert(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """pgvector via supabase-py expects the embedding as a list of floats — no transform needed."""
    return rows


async def parse_job(
    *,
    doc_id: str,
    source_type: SourceType,
    storage_path: str,
    filename: str | None = None,
) -> None:
    """End-to-end: parsing → embedding → ready_for_generation."""
    try:
        await _set_status(doc_id, "parsing")
        data = await _download(storage_path)
        # Parsing is sync/CPU-bound for office/PDF; run in a worker thread.
        blocks: list[Block] = await asyncio.to_thread(parse_doc, source_type, data, filename=filename)
        if not blocks:
            raise RuntimeError("no extractable text")

        chunks = await asyncio.to_thread(chunker, blocks)
        if not chunks:
            raise RuntimeError("chunker returned 0 chunks")

        await _set_status(doc_id, "embedding")
        texts = [c.text for c in chunks]
        vectors = await asyncio.to_thread(embed_texts, texts)

        sb = get_supabase_admin()
        if sb is not None:
            rows = [
                {
                    "document_id": doc_id,
                    "ord": c.ord,
                    "text": c.text,
                    "page_ref": c.page_ref,
                    "embedding": v,
                }
                for c, v in zip(chunks, vectors)
            ]
            # batch in groups of 200 to keep payloads small
            for i in range(0, len(rows), 200):
                sb.table("chunks").insert(rows[i : i + 200]).execute()

        # Day 2 stops here. Day 3 will flip to "generating" → "ready".
        await _set_status(doc_id, "ready_for_generation")
    except Exception as e:
        log.exception("parse_job failed (doc=%s)", doc_id)
        await _set_status(doc_id, "error", error=str(e))
        raise


def schedule_parse_job(**kwargs: Any) -> asyncio.Task:
    """Fire-and-forget. Day 2 uses an in-process task; Day 3+ swaps in arq."""
    return asyncio.create_task(parse_job(**kwargs))
