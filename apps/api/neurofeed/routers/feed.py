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

    # Documents owned by this user. Skip docs the owner has hidden from their
    # own feed — they're still visible to others in /api/feed/global if public,
    # they just no longer surface here.
    docs_res = (
        sb.table("documents")
        .select("id,title")
        .eq("user_id", user_id)
        .eq("status", "ready")
        .eq("hidden_from_owner", False)
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

    # Interest signals: aggregate the user's recent interested / not_interested
    # events by document_id and concept_id. +1 for interested, -1 for not.
    int_res = (
        sb.table("learning_events")
        .select("type,payload,ts")
        .eq("user_id", user_id)
        .in_("type", ["interested", "not_interested"])
        .order("ts", desc=True)
        .limit(500)
        .execute()
    )
    doc_interest: dict[str, float] = {}
    concept_interest: dict[str, float] = {}
    for evt in getattr(int_res, "data", None) or []:
        delta = 1.0 if evt["type"] == "interested" else -1.0
        payload = evt.get("payload") or {}
        d = payload.get("document_id")
        c = payload.get("concept_id")
        if isinstance(d, str) and d:
            doc_interest[d] = doc_interest.get(d, 0.0) + delta
        if isinstance(c, str) and c:
            concept_interest[c] = concept_interest.get(c, 0.0) + delta

    ranked = rank_artifacts(
        arts,
        mastery=mastery,
        limit=limit,
        doc_interest=doc_interest,
        concept_interest=concept_interest,
    )

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


@router.get("/global")
async def get_global_feed(
    user_id: str | None = Query(None, description="Requester id — surfaced on items so the UI can mark own posts"),
    limit: int = Query(40, ge=1, le=100),
) -> dict[str, Any]:
    """Public discovery feed: artifacts from every document where
    visibility='public' and status='ready' — including the requester's own
    docs, so they can verify their published content is live. The UI tags
    own items with a '(you)' marker. Newest-first for v1.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    docs_res = (
        sb.table("documents")
        .select("id,title,user_id,visibility,created_at")
        .eq("status", "ready")
        .eq("visibility", "public")
        .order("created_at", desc=True)
        .limit(80)
        .execute()
    )
    docs = getattr(docs_res, "data", None) or []
    if not docs:
        return {"items": []}
    doc_ids = [d["id"] for d in docs]
    meta_by_doc = {d["id"]: d for d in docs}

    art_res = (
        sb.table("artifacts")
        .select("id,document_id,concept_id,type,payload,created_at")
        .in_("document_id", doc_ids)
        .order("created_at", desc=True)
        .limit(limit * 4)
        .execute()
    )
    arts = getattr(art_res, "data", None) or []

    # Hydrate creator profile lites in one batched query so the UI can render
    # "by @alice" attributions without a per-card round-trip.
    creator_ids = list({meta_by_doc[d_id]["user_id"] for d_id in {a["document_id"] for a in arts}})
    profiles_map: dict[str, dict[str, Any]] = {}
    if creator_ids:
        try:
            pr = (
                sb.table("profiles")
                .select("user_id,username,display_name,avatar_seed")
                .in_("user_id", creator_ids)
                .execute()
            )
            for row in getattr(pr, "data", None) or []:
                profiles_map[row["user_id"]] = row
        except Exception:
            profiles_map = {}

    items: list[dict[str, Any]] = []
    for a in arts[:limit]:
        doc_meta = meta_by_doc.get(a["document_id"], {})
        owner_id = doc_meta.get("user_id")
        creator = profiles_map.get(owner_id or "", {}) if owner_id else {}
        items.append({
            **a,
            "document_title": doc_meta.get("title", ""),
            "creator": {
                "user_id": owner_id,
                "username": creator.get("username") or "unknown",
                "display_name": creator.get("display_name") or creator.get("username") or "unknown",
                "avatar_seed": creator.get("avatar_seed") or owner_id or "",
            } if owner_id else None,
        })
    return {"items": items}
