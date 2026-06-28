"""Reel engagement API — likes and comments on Global Feed reels.

Endpoints:
  GET    /api/reels/{artifact_id}/engagement?user_id=    summary: counts + has_liked
  POST   /api/reels/{artifact_id}/likes  { user_id }     idempotent like
  DELETE /api/reels/{artifact_id}/likes?user_id=         unlike
  GET    /api/reels/{artifact_id}/comments               list comments + author lites
  POST   /api/reels/{artifact_id}/comments               { user_id, body }
  DELETE /api/reels/comments/{comment_id}?user_id=       delete own comment

Engagement is only allowed on artifacts whose document is visibility='public'
to keep private reels out of the public engagement surface.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..deps import get_supabase_admin

router = APIRouter(prefix="/api/reels", tags=["reels"])


class LikeBody(BaseModel):
    user_id: str


class CommentBody(BaseModel):
    user_id: str
    body: str = Field(..., min_length=1, max_length=2000)


def _require_public_artifact(sb, artifact_id: str) -> dict[str, Any]:
    """Resolve the artifact + its document; reject if the doc isn't public.

    Returns the artifact row so callers can chain.
    """
    art_res = (
        sb.table("artifacts")
        .select("id,document_id,type")
        .eq("id", artifact_id)
        .single()
        .execute()
    )
    art = getattr(art_res, "data", None)
    if not art:
        raise HTTPException(404, "artifact not found")
    doc_res = (
        sb.table("documents")
        .select("id,visibility")
        .eq("id", art["document_id"])
        .single()
        .execute()
    )
    doc = getattr(doc_res, "data", None) or {}
    if doc.get("visibility") != "public":
        raise HTTPException(403, "engagement is only available on public reels")
    return art


# ---------- Engagement summary ----------

@router.get("/{artifact_id}/engagement")
async def engagement_summary(
    artifact_id: str,
    user_id: str | None = Query(None),
) -> dict[str, Any]:
    """Return like_count, comment_count, and the requester's has_liked flag
    in one round-trip so the UI doesn't need three calls to render a card."""
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    # Counts — head=True + count='exact' for cheap aggregates.
    likes_res = (
        sb.table("reel_likes")
        .select("user_id", count="exact", head=True)
        .eq("artifact_id", artifact_id)
        .execute()
    )
    comments_res = (
        sb.table("reel_comments")
        .select("id", count="exact", head=True)
        .eq("artifact_id", artifact_id)
        .execute()
    )

    has_liked = False
    if user_id:
        mine = (
            sb.table("reel_likes")
            .select("user_id")
            .eq("artifact_id", artifact_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        has_liked = bool(getattr(mine, "data", None))

    return {
        "like_count": getattr(likes_res, "count", 0) or 0,
        "comment_count": getattr(comments_res, "count", 0) or 0,
        "has_liked": has_liked,
    }


# ---------- Likes ----------

@router.post("/{artifact_id}/likes")
async def add_like(artifact_id: str, body: LikeBody) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    _require_public_artifact(sb, artifact_id)
    # Upsert via insert + on_conflict so repeat taps are idempotent.
    try:
        sb.table("reel_likes").upsert(
            {"user_id": body.user_id, "artifact_id": artifact_id},
            on_conflict="user_id,artifact_id",
        ).execute()
    except Exception as e:
        raise HTTPException(500, f"failed to like: {e}")
    return {"ok": "true", "liked": True}


@router.delete("/{artifact_id}/likes")
async def remove_like(
    artifact_id: str, user_id: str = Query(...)
) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    sb.table("reel_likes").delete().eq("artifact_id", artifact_id).eq(
        "user_id", user_id
    ).execute()
    return {"ok": "true", "liked": False}


# ---------- Comments ----------

@router.get("/{artifact_id}/comments")
async def list_comments(
    artifact_id: str,
    limit: int = Query(100, ge=1, le=200),
) -> dict[str, list[dict[str, Any]]]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    res = (
        sb.table("reel_comments")
        .select("id,artifact_id,user_id,body,created_at")
        .eq("artifact_id", artifact_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        return {"items": []}

    # Hydrate authors in one batched query so the comment list can show avatars
    # + usernames without per-row round-trips.
    author_ids = list({r["user_id"] for r in rows})
    profiles_map: dict[str, dict[str, Any]] = {}
    if author_ids:
        try:
            pr = (
                sb.table("profiles")
                .select("user_id,username,display_name,avatar_seed")
                .in_("user_id", author_ids)
                .execute()
            )
            for row in getattr(pr, "data", None) or []:
                profiles_map[row["user_id"]] = row
        except Exception:
            profiles_map = {}

    items = []
    for r in rows:
        author = profiles_map.get(r["user_id"]) or {}
        items.append({
            **r,
            "author": {
                "user_id": r["user_id"],
                "username": author.get("username") or "unknown",
                "display_name": author.get("display_name") or author.get("username") or "unknown",
                "avatar_seed": author.get("avatar_seed") or r["user_id"],
            },
        })
    return {"items": items}


@router.post("/{artifact_id}/comments")
async def add_comment(artifact_id: str, body: CommentBody) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    _require_public_artifact(sb, artifact_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "comment body required")
    ins = sb.table("reel_comments").insert(
        {"artifact_id": artifact_id, "user_id": body.user_id, "body": text}
    ).execute()
    rows = getattr(ins, "data", None) or []
    if not rows:
        raise HTTPException(500, "failed to post comment")
    row = rows[0]

    # Hydrate the author lite on the way back so the UI can render immediately.
    author = {}
    try:
        pr = (
            sb.table("profiles")
            .select("user_id,username,display_name,avatar_seed")
            .eq("user_id", body.user_id)
            .single()
            .execute()
        )
        author = getattr(pr, "data", None) or {}
    except Exception:
        author = {}

    return {
        **row,
        "author": {
            "user_id": body.user_id,
            "username": author.get("username") or "unknown",
            "display_name": author.get("display_name") or author.get("username") or "unknown",
            "avatar_seed": author.get("avatar_seed") or body.user_id,
        },
    }


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str, user_id: str = Query(...)
) -> dict[str, str]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    res = (
        sb.table("reel_comments").select("user_id").eq("id", comment_id).single().execute()
    )
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "comment not found")
    if row.get("user_id") != user_id:
        raise HTTPException(403, "not the author")
    sb.table("reel_comments").delete().eq("id", comment_id).execute()
    return {"ok": "true"}
