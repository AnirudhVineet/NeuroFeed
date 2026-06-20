"""Document & artifact read APIs."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..deps import get_supabase_admin
from ..workers.jobs import schedule_generate_job

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    """List a user's documents enriched with per-type artifact counts.

    Used by the dashboard to render the "Your library" panel. Counts are
    cheap aggregates done in Python after fetching only the document_id +
    type columns to keep the query inexpensive.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    docs_res = (
        sb.table("documents")
        .select("id,title,status,source_type,created_at,error")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    docs = getattr(docs_res, "data", None) or []
    if not docs:
        return {"items": []}

    doc_ids = [d["id"] for d in docs]
    art_res = (
        sb.table("artifacts")
        .select("document_id,type")
        .in_("document_id", doc_ids)
        .execute()
    )
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in getattr(art_res, "data", None) or []:
        counts[row["document_id"]][row["type"]] += 1

    items: list[dict[str, Any]] = []
    for d in docs:
        c = counts.get(d["id"], {})
        items.append({
            **d,
            "counts": {
                "summary": c.get("summary", 0),
                "swipe_card": c.get("swipe_card", 0),
                "flashcard": c.get("flashcard", 0),
                "quiz": c.get("quiz", 0),
                "reel_script": c.get("reel_script", 0),
                "learning_path_step": c.get("learning_path_step", 0),
                "total": sum(c.values()),
            },
        })
    return {"items": items}


@router.get("/{doc_id}")
async def get_document(doc_id: str) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    res = sb.table("documents").select("*").eq("id", doc_id).single().execute()
    data = getattr(res, "data", None)
    if not data:
        raise HTTPException(404, "document not found")
    return data


@router.get("/{doc_id}/artifacts")
async def list_artifacts(doc_id: str) -> dict[str, list[dict[str, Any]]]:
    """Return artifacts grouped by type. Empty buckets are omitted."""
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    res = (
        sb.table("artifacts")
        .select("id,type,payload,concept_id,created_at")
        .eq("document_id", doc_id)
        .order("created_at")
        .execute()
    )
    rows = getattr(res, "data", None) or []
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["type"]].append(row)
    return grouped


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Query(...)) -> dict[str, str]:
    """Delete a document. Cascades to chunks, concepts, and artifacts via FK.

    `user_id` is required and checked against the document's owner so the
    admin service-role client can't be used to delete someone else's row.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    owner = (
        sb.table("documents")
        .select("user_id,storage_path")
        .eq("id", doc_id)
        .single()
        .execute()
    )
    row = getattr(owner, "data", None)
    if not row:
        raise HTTPException(404, "document not found")
    if row.get("user_id") != user_id:
        raise HTTPException(403, "not the owner")

    sb.table("documents").delete().eq("id", doc_id).execute()

    # Best-effort: remove the underlying storage object. Failure here is
    # non-fatal — the doc row is already gone and the storage policy will
    # eventually GC orphans.
    storage_path = row.get("storage_path") or ""
    if "/" in storage_path:
        bucket, _, key = storage_path.partition("/")
        try:
            sb.storage.from_(bucket).remove([key])
        except Exception:
            pass

    return {"ok": "true"}


@router.post("/{doc_id}/regenerate")
async def regenerate_document(doc_id: str, user_id: str = Query(...)) -> dict[str, str]:
    """Wipe existing artifacts + concepts for a doc and re-run generation.

    Chunks are kept so we don't need to re-parse/re-embed; only the LLM
    fan-out is repeated.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    owner = (
        sb.table("documents")
        .select("user_id,status")
        .eq("id", doc_id)
        .single()
        .execute()
    )
    row = getattr(owner, "data", None)
    if not row:
        raise HTTPException(404, "document not found")
    if row.get("user_id") != user_id:
        raise HTTPException(403, "not the owner")

    sb.table("artifacts").delete().eq("document_id", doc_id).execute()
    sb.table("concepts").delete().eq("document_id", doc_id).execute()

    schedule_generate_job(doc_id=doc_id)
    return {"ok": "true"}
