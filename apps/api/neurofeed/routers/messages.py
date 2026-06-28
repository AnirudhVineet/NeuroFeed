"""1:1 direct-message API.

Endpoints:
  GET    /api/messages/conversations?user_id=
  POST   /api/messages/conversations               { user_id, peer_id }
  GET    /api/messages/{conv_id}?user_id=&limit=&before=
  POST   /api/messages/{conv_id}                   { user_id, kind, body?, artifact_id? }
  POST   /api/messages/{conv_id}/read              { user_id }

All endpoints use the admin (service-role) client and enforce membership /
friendship checks in Python — the same RLS rules apply to client realtime
subscriptions, so the browser still can't read messages it doesn't own.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..deps import get_supabase_admin

router = APIRouter(prefix="/api/messages", tags=["messages"])

MessageKind = Literal["text", "reel_share"]


class OpenConversationBody(BaseModel):
    user_id: str
    peer_id: str


class SendMessageBody(BaseModel):
    user_id: str
    kind: MessageKind = "text"
    body: str | None = None
    artifact_id: str | None = None


class ReadBody(BaseModel):
    user_id: str


# ---------- Helpers ----------

def _canonical(a: str, b: str) -> tuple[str, str]:
    """Return (low, high) so the pair key is deterministic."""
    return (a, b) if a < b else (b, a)


def _require_friends(sb, a: str, b: str) -> None:
    lo, hi = _canonical(a, b)
    res = (
        sb.table("friendships")
        .select("user_a")
        .eq("user_a", lo)
        .eq("user_b", hi)
        .limit(1)
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(403, "you can only message friends")


def _require_member(sb, conv_id: str, user_id: str) -> dict[str, Any]:
    res = (
        sb.table("conversations")
        .select("id,user_a,user_b")
        .eq("id", conv_id)
        .single()
        .execute()
    )
    conv = getattr(res, "data", None)
    if not conv:
        raise HTTPException(404, "conversation not found")
    if user_id not in (conv["user_a"], conv["user_b"]):
        raise HTTPException(403, "not a member of this conversation")
    return conv


# ---------- Conversations ----------

@router.get("/conversations")
async def list_conversations(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    """List conversations the user is in, joined with peer profile + last
    message preview + unread count, sorted newest-first."""
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    res = (
        sb.table("conversations")
        .select("id,user_a,user_b,created_at,last_message_at")
        .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}")
        .order("last_message_at", desc=True)
        .execute()
    )
    convs = getattr(res, "data", None) or []
    if not convs:
        return {"items": []}

    peer_ids = list({(c["user_a"] if c["user_b"] == user_id else c["user_b"]) for c in convs})
    profiles_map: dict[str, dict[str, Any]] = {}
    if peer_ids:
        pr = (
            sb.table("profiles")
            .select("user_id,username,display_name,avatar_seed")
            .in_("user_id", peer_ids)
            .execute()
        )
        for row in getattr(pr, "data", None) or []:
            profiles_map[row["user_id"]] = row

    # Pull the latest message per conv in one query, then group in Python.
    conv_ids = [c["id"] for c in convs]
    last_by_conv: dict[str, dict[str, Any]] = {}
    if conv_ids:
        msg_res = (
            sb.table("messages")
            .select("id,conversation_id,sender_id,kind,body,artifact_id,created_at,read_at")
            .in_("conversation_id", conv_ids)
            .order("created_at", desc=True)
            .limit(len(conv_ids) * 8)  # rough buffer; we only keep the newest per conv
            .execute()
        )
        for row in getattr(msg_res, "data", None) or []:
            cid = row["conversation_id"]
            if cid not in last_by_conv:
                last_by_conv[cid] = row

    # Unread count per conv: messages where sender != user_id and read_at is null.
    unread_by_conv: dict[str, int] = {}
    if conv_ids:
        u_res = (
            sb.table("messages")
            .select("conversation_id")
            .in_("conversation_id", conv_ids)
            .neq("sender_id", user_id)
            .is_("read_at", "null")
            .execute()
        )
        for row in getattr(u_res, "data", None) or []:
            unread_by_conv[row["conversation_id"]] = unread_by_conv.get(row["conversation_id"], 0) + 1

    items: list[dict[str, Any]] = []
    for c in convs:
        peer_id = c["user_a"] if c["user_b"] == user_id else c["user_b"]
        peer = profiles_map.get(peer_id) or {}
        last = last_by_conv.get(c["id"])
        items.append({
            "id": c["id"],
            "peer": {
                "user_id": peer_id,
                "username": peer.get("username") or "unknown",
                "display_name": peer.get("display_name") or peer.get("username") or "unknown",
                "avatar_seed": peer.get("avatar_seed") or peer_id,
            },
            "last_message": last,
            "unread_count": unread_by_conv.get(c["id"], 0),
            "last_message_at": c["last_message_at"],
            "created_at": c["created_at"],
        })
    return {"items": items}


@router.post("/conversations")
async def open_conversation(body: OpenConversationBody) -> dict[str, Any]:
    """Get-or-create the 1:1 conversation between user_id and peer_id.

    Requires the two users to already be friends.
    """
    if body.user_id == body.peer_id:
        raise HTTPException(400, "cannot start a conversation with yourself")

    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    _require_friends(sb, body.user_id, body.peer_id)

    # Use the SQL helper that does insert-or-fetch atomically.
    rpc = sb.rpc(
        "upsert_conversation",
        {"p_user1": body.user_id, "p_user2": body.peer_id},
    ).execute()
    conv_id = getattr(rpc, "data", None)
    if not conv_id:
        raise HTTPException(500, "failed to open conversation")
    return {"id": conv_id}


# ---------- Messages ----------

@router.get("/{conv_id}")
async def list_messages(
    conv_id: str,
    user_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    before: str | None = Query(None, description="ISO timestamp — fetch messages older than this"),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    _require_member(sb, conv_id, user_id)

    q = (
        sb.table("messages")
        .select("id,conversation_id,sender_id,kind,body,artifact_id,created_at,read_at")
        .eq("conversation_id", conv_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if before:
        q = q.lt("created_at", before)
    res = q.execute()
    rows = getattr(res, "data", None) or []
    rows.reverse()  # send oldest-first so the UI just appends

    # Hydrate any reel_share artifacts in one batched query so the chat can
    # render the shared reel inline without a per-message round-trip.
    artifact_ids = [r["artifact_id"] for r in rows if r.get("artifact_id")]
    artifacts_by_id: dict[str, dict[str, Any]] = {}
    if artifact_ids:
        a_res = (
            sb.table("artifacts")
            .select("id,document_id,type,payload")
            .in_("id", artifact_ids)
            .execute()
        )
        for a in getattr(a_res, "data", None) or []:
            artifacts_by_id[a["id"]] = a

        # Pull doc titles so the share card can show "from <doc title>".
        doc_ids = list({a["document_id"] for a in artifacts_by_id.values()})
        if doc_ids:
            d_res = sb.table("documents").select("id,title").in_("id", doc_ids).execute()
            titles = {d["id"]: d["title"] for d in (getattr(d_res, "data", None) or [])}
            for a in artifacts_by_id.values():
                a["document_title"] = titles.get(a["document_id"], "")

    items = []
    for r in rows:
        artifact = artifacts_by_id.get(r.get("artifact_id")) if r.get("artifact_id") else None
        items.append({**r, "artifact": artifact})
    return {"items": items}


@router.post("/{conv_id}")
async def send_message(conv_id: str, body: SendMessageBody) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    _require_member(sb, conv_id, body.user_id)

    if body.kind == "text":
        text = (body.body or "").strip()
        if not text:
            raise HTTPException(400, "text body required")
        if len(text) > 2000:
            raise HTTPException(400, "message too long (max 2000 chars)")
        payload = {
            "conversation_id": conv_id,
            "sender_id": body.user_id,
            "kind": "text",
            "body": text,
        }
    elif body.kind == "reel_share":
        if not body.artifact_id:
            raise HTTPException(400, "artifact_id required for reel_share")
        # Verify artifact exists and is a reel_script.
        a_res = (
            sb.table("artifacts")
            .select("id,type")
            .eq("id", body.artifact_id)
            .single()
            .execute()
        )
        a = getattr(a_res, "data", None)
        if not a:
            raise HTTPException(404, "artifact not found")
        if a.get("type") != "reel_script":
            raise HTTPException(400, "only reel artifacts can be shared")
        payload = {
            "conversation_id": conv_id,
            "sender_id": body.user_id,
            "kind": "reel_share",
            "artifact_id": body.artifact_id,
        }
    else:
        raise HTTPException(400, "unsupported message kind")

    ins = sb.table("messages").insert(payload).execute()
    rows = getattr(ins, "data", None) or []
    if not rows:
        raise HTTPException(500, "failed to send message")
    return rows[0]


@router.post("/{conv_id}/read")
async def mark_read(conv_id: str, body: ReadBody) -> dict[str, str]:
    """Mark every unread message in a conversation as read for this user.

    Only messages NOT sent by this user are updated.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    _require_member(sb, conv_id, body.user_id)

    sb.table("messages").update({"read_at": "now()"}).eq("conversation_id", conv_id).neq(
        "sender_id", body.user_id
    ).is_("read_at", "null").execute()
    return {"ok": "true"}
