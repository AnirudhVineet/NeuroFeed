"""Background jobs: parse_job and generate_job."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..deps import get_supabase_admin
from ..services.chunk import chunk as chunker
from ..services.embed import embed_texts
from ..services.parse import Block, parse as parse_doc, SourceType
from ..services import generate as gen
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
    bucket, _, key = storage_path.partition("/")
    if not key:
        raise ValueError(f"storage_path must be 'bucket/key', got {storage_path!r}")
    return sb.storage.from_(bucket).download(key)


# ===================================================================
# parse_job
# ===================================================================
async def parse_job(
    *,
    doc_id: str,
    source_type: SourceType,
    storage_path: str,
    filename: str | None = None,
    auto_generate: bool = True,
) -> None:
    """parse → chunk → embed → (optionally) chain into generate_job."""
    try:
        await _set_status(doc_id, "parsing")
        data = await _download(storage_path)
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
            for i in range(0, len(rows), 200):
                sb.table("chunks").insert(rows[i : i + 200]).execute()

        await _set_status(doc_id, "ready_for_generation")
    except Exception as e:
        log.exception("parse_job failed (doc=%s)", doc_id)
        await _set_status(doc_id, "error", error=str(e))
        return

    if auto_generate:
        await generate_job(doc_id=doc_id)


# ===================================================================
# generate_job
# ===================================================================
async def generate_job(*, doc_id: str) -> None:
    """Fan out per-artifact generators (Featherless 4-wide pool), persist, mark ready."""
    sb = get_supabase_admin()
    if sb is None:
        log.warning("generate_job: supabase not configured; skipping (doc=%s)", doc_id)
        return

    try:
        await _set_status(doc_id, "generating")

        res = (
            sb.table("chunks")
            .select("id,ord,text,page_ref")
            .eq("document_id", doc_id)
            .order("ord")
            .limit(300)
            .execute()
        )
        chunks: list[dict[str, Any]] = getattr(res, "data", None) or []
        if not chunks:
            raise RuntimeError("no chunks to generate from")
        chunk_by_id: dict[int, dict[str, Any]] = {c["id"]: c for c in chunks}

        # Concepts first (downstream artifacts reference concept ids).
        concept_set = await gen.gen_key_concepts(chunks)
        concept_rows = [
            {"document_id": doc_id, "name": c.name, "summary": c.definition}
            for c in concept_set.concepts
        ]
        inserted = sb.table("concepts").insert(concept_rows).execute()
        persisted = getattr(inserted, "data", None) or []
        # zip the LLM concept order with persisted ids for downstream lookups
        concepts_for_prompt: list[dict[str, Any]] = [
            {
                "id": str(persisted[i]["id"]) if i < len(persisted) else "",
                "name": c.name,
                "definition": c.definition,
                "summary": c.definition,
                "why_it_matters": c.why_it_matters,
                "source_chunk_ids": list(c.source_chunk_ids),
            }
            for i, c in enumerate(concept_set.concepts)
        ]

        # Fan out — Featherless client semaphore caps at 4 concurrent automatically.
        results = await asyncio.gather(
            gen.gen_summary(chunks),
            gen.gen_swipe_cards(chunks, concepts_for_prompt),
            gen.gen_flashcards(chunks, concepts_for_prompt),
            gen.gen_quiz(chunks),
            gen.gen_learning_path(concepts_for_prompt),
            return_exceptions=True,
        )
        summary_r, swipe_r, flash_r, quiz_r, path_r = results

        artifact_rows: list[dict[str, Any]] = []

        if not isinstance(summary_r, Exception):
            artifact_rows.append({
                "document_id": doc_id, "concept_id": None,
                "type": "summary", "payload": summary_r.model_dump(),
            })

        if not isinstance(swipe_r, Exception):
            for card in swipe_r.cards:
                artifact_rows.append({
                    "document_id": doc_id,
                    "concept_id": card.concept_id if card.concept_id else None,
                    "type": "swipe_card", "payload": card.model_dump(),
                })

        if not isinstance(flash_r, Exception):
            for card in flash_r.cards:
                artifact_rows.append({
                    "document_id": doc_id,
                    "concept_id": card.concept_id if card.concept_id else None,
                    "type": "flashcard", "payload": card.model_dump(),
                })

        if not isinstance(quiz_r, Exception):
            for item in quiz_r.items:
                artifact_rows.append({
                    "document_id": doc_id, "concept_id": None,
                    "type": "quiz", "payload": item.model_dump(),
                })

        if not isinstance(path_r, Exception):
            for step in path_r.steps:
                artifact_rows.append({
                    "document_id": doc_id,
                    "concept_id": step.concept_id if step.concept_id else None,
                    "type": "learning_path_step", "payload": step.model_dump(),
                })

        # Reels: one per concept, capped. Each reel uses concept-specific chunks
        # so deep PDFs get topic-grounded scenes instead of a stale prefix window.
        def _chunks_for_topic(topic: dict[str, Any]) -> list[dict[str, Any]]:
            ids = topic.get("source_chunk_ids") or []
            selected = [chunk_by_id[i] for i in ids if i in chunk_by_id]
            if len(selected) >= 3:
                return selected[:15]
            # Fallback: top-of-doc plus any cited chunks, so generation always has signal.
            seen: set[int] = {c["id"] for c in selected}
            for c in chunks:
                if c["id"] in seen:
                    continue
                selected.append(c)
                if len(selected) >= 12:
                    break
            return selected

        reel_cap = gen.CAPS["reel_scripts"] if isinstance(gen.CAPS["reel_scripts"], int) else 30
        reel_targets = concepts_for_prompt[:reel_cap]
        reels = await asyncio.gather(
            *(gen.gen_reel_script(t, _chunks_for_topic(t)) for t in reel_targets),
            return_exceptions=True,
        )
        for target, script in zip(reel_targets, reels):
            if isinstance(script, Exception):
                log.warning("reel_script failed for concept %s: %s", target["name"], script)
                continue
            artifact_rows.append({
                "document_id": doc_id,
                "concept_id": target["id"] or None,
                "type": "reel_script", "payload": script.model_dump(),
            })

        for i in range(0, len(artifact_rows), 100):
            sb.table("artifacts").insert(artifact_rows[i : i + 100]).execute()

        await _set_status(doc_id, "ready")
    except Exception as e:
        log.exception("generate_job failed (doc=%s)", doc_id)
        await _set_status(doc_id, "error", error=str(e))


# ===================================================================
# Schedulers
# ===================================================================
def schedule_parse_job(**kwargs: Any) -> asyncio.Task:
    return asyncio.create_task(parse_job(**kwargs))


def schedule_generate_job(**kwargs: Any) -> asyncio.Task:
    return asyncio.create_task(generate_job(**kwargs))
