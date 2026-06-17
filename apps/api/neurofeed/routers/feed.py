"""Ranked feed."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..deps import get_supabase_admin
from ..services.rank import rank_artifacts

router = APIRouter(prefix="/api/feed", tags=["feed"])


@router.get("")
async def get_feed(
    user_id: str = Query(...),
    limit: int = Query(30, ge=1, le=100),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    # Documents owned by this user
    docs_res = (
        sb.table("documents")
        .select("id,title")
        .eq("user_id", user_id)
        .eq("status", "ready")
        .execute()
    )
    docs = getattr(docs_res, "data", None) or []
    if not docs:
        return {"items": []}
    doc_ids = [d["id"] for d in docs]
    title_by_doc = {d["id"]: d["title"] for d in docs}

    # All artifacts for those documents (limit modestly; ranking happens in memory)
    art_res = (
        sb.table("artifacts")
        .select("id,document_id,concept_id,type,payload,created_at")
        .in_("document_id", doc_ids)
        .order("created_at", desc=True)
        .limit(300)
        .execute()
    )
    arts = getattr(art_res, "data", None) or []
    for a in arts:
        a["document_title"] = title_by_doc.get(a["document_id"], "")

    # Mastery snapshot
    m_res = sb.table("mastery").select("concept_id,score").eq("user_id", user_id).execute()
    mastery = {row["concept_id"]: float(row["score"]) for row in (getattr(m_res, "data", None) or [])}

    ranked = rank_artifacts(arts, mastery=mastery, limit=limit)

    # Stamp into feed_items so analytics knows what we showed
    if ranked:
        rows = [
            {
                "user_id": user_id,
                "artifact_id": r["id"],
                "score": r["score"],
                "reason": r["reason"],
            }
            for r in ranked
        ]
        try:
            sb.table("feed_items").insert(rows).execute()
        except Exception:
            pass

    return {"items": ranked}
