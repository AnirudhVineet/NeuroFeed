"""Document & artifact read APIs."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException

from ..deps import get_supabase_admin

router = APIRouter(prefix="/api/documents", tags=["documents"])


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
