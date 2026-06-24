"""Social layer endpoints: profiles, follows, friends, challenges, bookmarks,
path progress, doc visibility, privacy, social activity, leaderboard.

All endpoints accept `user_id` as a query string parameter for write
operations (consistent with the rest of the codebase), and rely on Postgres
RLS for read scoping. Service-role client is used so we can bypass RLS where
the API needs to read across users (e.g. discover, leaderboard); per-row
ownership is enforced in Python before any mutation.
"""
from __future__ import annotations

import logging
import random
from functools import wraps
from typing import Any, Callable, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..deps import get_supabase_admin

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["social"])

Visibility = Literal["private", "friends", "public"]
ChallengeMode = Literal["1v1", "timed", "random", "document", "chapter"]
PathStatus = Literal["not_started", "in_progress", "completed"]


def _sb():
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    return sb


def _is_missing_schema(exc: Exception) -> bool:
    """True when the supabase error indicates a missing table/column.
    Catches:
      - Postgres SQLSTATE 42P01 (undefined_table) / 42703 (undefined_column)
      - PostgREST PGRST204 / PGRST205 (column/table not found in schema cache)
      - Plain "does not exist" / "could not find" messages
    The social + multiplayer migrations are gated behind manual application;
    when they haven't been applied yet we want to degrade to empty data
    instead of returning 500."""
    s = str(exc).lower()
    return (
        "42p01" in s
        or "42703" in s
        or "pgrst204" in s
        or "pgrst205" in s
        or "does not exist" in s
        or "could not find" in s
        or "schema cache" in s
    )


def safe_read(default_factory: Callable[[], Any]):
    """Decorator: turn missing-schema crashes into a default response so the
    Social page can keep rendering when the 2026-06-22_social.sql migration
    hasn't been applied. Real errors (and HTTPExceptions) still propagate."""
    def deco(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            try:
                return await fn(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as exc:
                if _is_missing_schema(exc):
                    return default_factory()
                raise
        return wrapper
    return deco


def _safe_profiles_query(user_id: Optional[str], q: Optional[str], subject: Optional[str], limit: int, offset: int = 0) -> list[dict[str, Any]]:
    """Query public profiles with optional filters. Returns [] (never raises)
    when the social migration is missing or the table is empty."""
    sb = _sb()
    try:
        qbuilder = sb.table("profiles").select("*").eq("is_public", True)
        if user_id:
            qbuilder = qbuilder.neq("user_id", user_id)
        if q:
            clean = _sanitize_q(q)
            if clean:
                qbuilder = qbuilder.or_(
                    f"username.ilike.%{clean}%,display_name.ilike.%{clean}%,"
                    f"bio.ilike.%{clean}%,college.ilike.%{clean}%"
                )
        if subject:
            qbuilder = qbuilder.contains("subjects", [subject])
        res = (
            qbuilder.order("created_at", desc=True)
            .range(offset, offset + limit - 1).execute()
        )
        return getattr(res, "data", None) or []
    except Exception as exc:
        if _is_missing_schema(exc):
            return []
        raise


def _profile_by_user_id(user_id: str) -> Optional[dict[str, Any]]:
    sb = _sb()
    try:
        res = sb.table("profiles").select("*").eq("user_id", user_id).maybe_single().execute()
    except Exception as exc:
        if _is_missing_schema(exc):
            return None
        raise
    return getattr(res, "data", None)


def _profile_by_username(username: str) -> Optional[dict[str, Any]]:
    sb = _sb()
    try:
        res = (
            sb.table("profiles")
            .select("*")
            .ilike("username", username)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if _is_missing_schema(exc):
            return None
        raise
    rows = getattr(res, "data", None) or []
    return rows[0] if rows else None


def _ensure_profile(user_id: str) -> dict[str, Any]:
    """If the auth trigger didn't fire (e.g. existing user before migration),
    create a minimal profile + privacy row on the fly so the API never returns
    404 for the calling user."""
    sb = _sb()
    p = _profile_by_user_id(user_id)
    if p:
        return p
    # Look up the email to seed username if available
    email = None
    try:
        ures = sb.auth.admin.get_user_by_id(user_id)  # type: ignore[attr-defined]
        email = (getattr(ures, "user", None) or {}).get("email") if isinstance(ures, dict) else None
    except Exception:
        pass
    base = (email or user_id).split("@")[0].lower()
    uname = "".join(c for c in base if c.isalnum() or c == "_") or "learner"
    # Avoid collision with an existing username
    suffix = ""
    while True:
        existing = _profile_by_username(uname + suffix)
        if not existing or existing.get("user_id") == user_id:
            break
        suffix = str(int(suffix or "1") + 1)
    try:
        sb.table("profiles").insert({
            "user_id": user_id,
            "username": uname + suffix,
            "display_name": uname + suffix,
            "avatar_seed": user_id,
        }).execute()
    except Exception as exc:
        if not _is_missing_schema(exc):
            raise
    try:
        sb.table("privacy_settings").insert({"user_id": user_id}).execute()
    except Exception as exc:
        if not _is_missing_schema(exc):
            raise
    return _profile_by_user_id(user_id) or {"user_id": user_id, "username": uname + suffix}


def _hydrate_profile(p: dict[str, Any]) -> dict[str, Any]:
    """Attach computed fields: xp, streak, followers/following counts.

    Wrapped in defensive try/except so a single failing supplementary query
    (e.g. transient Postgres timeout, missing learning_events table on a fresh
    project) doesn't break the entire Social page — we fall back to zeros and
    still return the profile."""
    sb = _sb()
    uid = p["user_id"]
    xp = streak = 0
    achievements: list[str] = []
    try:
        from ..services.gamify import get_state
        state = get_state(uid)
        xp = state.xp_total
        streak = state.streak
        achievements = state.achievements
    except Exception:
        pass
    followers_count = following_count = uploads_count = 0
    try:
        followers = sb.table("follows").select("follower", count="exact").eq("followee", uid).execute()
        followers_count = getattr(followers, "count", 0) or 0
    except Exception:
        pass
    try:
        following = sb.table("follows").select("followee", count="exact").eq("follower", uid).execute()
        following_count = getattr(following, "count", 0) or 0
    except Exception:
        pass
    try:
        docs = sb.table("documents").select("id", count="exact").eq("user_id", uid).execute()
        uploads_count = getattr(docs, "count", 0) or 0
    except Exception:
        pass
    # Fill in defaults for fields the social migration adds, so the frontend
    # gets a complete ProfileMeta shape even when the row predates the
    # migration (existing user, no username/bio/etc. columns yet).
    base_username = (p.get("username") or "").strip()
    if not base_username:
        seed = p.get("display_name") or p.get("user_id") or "learner"
        base_username = "".join(c for c in str(seed).split("@")[0].lower() if c.isalnum() or c == "_") or "learner"
    return {
        "user_id": p.get("user_id", ""),
        "username": base_username,
        "display_name": p.get("display_name") or base_username,
        "bio": p.get("bio") or "",
        "pronouns": p.get("pronouns") or "",
        "college": p.get("college") or "",
        "subjects": p.get("subjects") or [],
        "avatar_seed": p.get("avatar_seed") or p.get("user_id") or base_username,
        "is_public": bool(p.get("is_public", True)),
        "hidden_activity": bool(p.get("hidden_activity", False)),
        "xp": xp,
        "streak": streak,
        "achievements": achievements,
        "followers_count": followers_count,
        "following_count": following_count,
        "uploads_count": uploads_count,
    }


# ============================================================
# Profiles
# ============================================================

class ProfilePatch(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    college: Optional[str] = None
    pronouns: Optional[str] = None
    subjects: Optional[list[str]] = None
    avatar_seed: Optional[str] = None
    is_public: Optional[bool] = None
    hidden_activity: Optional[bool] = None


@router.get("/profiles/me")
@safe_read(lambda: {"user_id": "", "username": "", "display_name": "", "bio": "", "pronouns": "", "college": "", "subjects": [], "avatar_seed": "", "is_public": True, "hidden_activity": False, "xp": 0, "streak": 0, "achievements": [], "followers_count": 0, "following_count": 0, "uploads_count": 0})
async def get_my_profile(user_id: str = Query(...)) -> dict[str, Any]:
    p = _ensure_profile(user_id)
    return _hydrate_profile(p)


@router.get("/profiles/by-username/{username}")
async def get_profile_by_username(username: str) -> dict[str, Any]:
    p = _profile_by_username(username)
    if not p:
        raise HTTPException(404, "profile not found")
    return _hydrate_profile(p)


@router.patch("/profiles/me")
async def update_my_profile(patch: ProfilePatch, user_id: str = Query(...)) -> dict[str, Any]:
    sb = _sb()
    _ensure_profile(user_id)
    data = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if "username" in data:
        data["username"] = data["username"].lower().strip()
        if not data["username"]:
            raise HTTPException(422, "username cannot be empty")
        # Reject collisions (case-insensitive) with another user
        existing = _profile_by_username(data["username"])
        if existing and existing.get("user_id") != user_id:
            raise HTTPException(409, "username already taken")
    sb.table("profiles").update(data).eq("user_id", user_id).execute()
    return _hydrate_profile(_profile_by_user_id(user_id) or {"user_id": user_id})


def _sanitize_q(q: str) -> str:
    """Strip PostgREST OR-syntax meta chars from a user-supplied query string
    so a stray comma/parenthesis can't break the .or_() filter."""
    return "".join(c for c in q if c not in ",()").strip()


@router.get("/profiles/discover")
@safe_read(lambda: {"items": []})
async def discover_profiles(
    user_id: Optional[str] = None,
    subject: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 30,
) -> dict[str, list[dict[str, Any]]]:
    rows = _safe_profiles_query(user_id, q, subject, limit)
    return {"items": [_hydrate_profile(p) for p in rows]}


# ============================================================
# Global user search
# ============================================================

def _last_active(user_ids: list[str]) -> dict[str, str]:
    """Return the most recent learning_event timestamp per user, batched."""
    sb = _sb()
    if not user_ids:
        return {}
    try:
        res = (
            sb.table("learning_events").select("user_id,ts")
            .in_("user_id", user_ids).order("ts", desc=True).limit(500).execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception:
        return {}
    out: dict[str, str] = {}
    for r in rows:
        uid = r.get("user_id")
        ts = r.get("ts")
        if uid and ts and uid not in out:
            out[uid] = ts
    return out


def _mutual_followers_map(me_id: str, target_ids: list[str]) -> dict[str, int]:
    """For each target, how many of MY followees also follow that target?
    Returns {target_user_id: count}."""
    sb = _sb()
    if not me_id or not target_ids:
        return {tid: 0 for tid in target_ids}
    try:
        mine = sb.table("follows").select("followee").eq("follower", me_id).execute()
        my_followees = {r["followee"] for r in (getattr(mine, "data", None) or [])}
        if not my_followees:
            return {tid: 0 for tid in target_ids}
        res = (
            sb.table("follows").select("follower,followee")
            .in_("followee", target_ids).in_("follower", list(my_followees)).execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception:
        return {tid: 0 for tid in target_ids}
    counts: dict[str, int] = {tid: 0 for tid in target_ids}
    for r in rows:
        counts[r["followee"]] = counts.get(r["followee"], 0) + 1
    return counts


@router.get("/users/search")
@safe_read(lambda: {"items": [], "limit": 0, "offset": 0, "q": ""})
async def search_users(
    q: str = Query("", description="Free-text query — matches username, display_name, bio, subjects"),
    user_id: Optional[str] = Query(None, description="Requester user_id — excludes self and computes mutual follower counts"),
    subject: Optional[str] = None,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Real-time global user search. Searches username, display_name, bio,
    college, and the subjects array. Case-insensitive partial match.

    Returns a list of search hits with the lightweight fields needed by the
    Social search UI (avatar, level, streak, XP, subjects, followers count,
    mutual follower count, last active).
    """
    sb = _sb()
    clean = _sanitize_q(q or "")
    rows = _safe_profiles_query(user_id, clean or None, subject, limit, offset)

    # Also match by subjects array (text[]) when q looks like a subject —
    # e.g. "math", "networking". Cheap second pass; merge by user_id.
    if clean:
        try:
            sub_res = (
                sb.table("profiles").select("*").eq("is_public", True)
                .contains("subjects", [clean]).limit(limit).execute()
            )
            extras = getattr(sub_res, "data", None) or []
            seen = {r["user_id"] for r in rows}
            for r in extras:
                if r["user_id"] != user_id and r["user_id"] not in seen:
                    rows.append(r)
                    seen.add(r["user_id"])
        except Exception:
            pass

    rows = rows[:limit]
    user_ids = [r["user_id"] for r in rows]
    last_active = _last_active(user_ids)
    mutual = _mutual_followers_map(user_id or "", user_ids) if user_id else {}

    items: list[dict[str, Any]] = []
    for p in rows:
        hyd = _hydrate_profile(p)
        items.append({
            **hyd,
            "level": max(1, int(hyd.get("xp", 0)) // 250),
            "last_active": last_active.get(p["user_id"]),
            "mutual_followers_count": int(mutual.get(p["user_id"], 0)),
        })
    return {"items": items, "limit": limit, "offset": offset, "q": clean}


@router.get("/users/suggested")
@safe_read(lambda: {"trending": [], "top_streaks": [], "recent_uploaders": [], "mutual_interests": []})
async def suggested_users(
    user_id: Optional[str] = Query(None),
    limit: int = Query(12, ge=1, le=50),
) -> dict[str, Any]:
    """Buckets for the empty-search state on the Social page:
    `trending` (most-followed), `top_streaks`, `recent_uploaders`, `mutual_interests`."""
    sb = _sb()
    rows = _safe_profiles_query(user_id, None, None, 200)

    # Opt-outs
    if rows:
        try:
            priv = (
                sb.table("privacy_settings").select("user_id,profile")
                .in_("user_id", [r["user_id"] for r in rows]).execute()
            )
            private = {p["user_id"] for p in (getattr(priv, "data", None) or []) if p.get("profile") == "private"}
            rows = [r for r in rows if r["user_id"] not in private]
        except Exception:
            pass

    hyd = [_hydrate_profile(p) for p in rows]
    last_active = _last_active([r["user_id"] for r in rows])

    me_subjects: set[str] = set()
    if user_id:
        me = _profile_by_user_id(user_id)
        if me:
            me_subjects = set(me.get("subjects") or [])

    def lite(p: dict[str, Any]) -> dict[str, Any]:
        return {
            **p,
            "level": max(1, int(p.get("xp", 0)) // 250),
            "last_active": last_active.get(p["user_id"]),
        }

    trending = sorted(hyd, key=lambda p: -int(p.get("followers_count", 0)))[:limit]
    top_streaks = sorted(hyd, key=lambda p: -int(p.get("streak", 0)))[:limit]
    recent_uploaders = sorted(hyd, key=lambda p: -int(p.get("uploads_count", 0)))[:limit]
    mutual = [
        p for p in hyd
        if me_subjects and (set(p.get("subjects") or []) & me_subjects)
    ][:limit]

    return {
        "trending": [lite(p) for p in trending],
        "top_streaks": [lite(p) for p in top_streaks],
        "recent_uploaders": [lite(p) for p in recent_uploaders],
        "mutual_interests": [lite(p) for p in mutual],
    }


# ============================================================
# Notifications
# ============================================================

NotificationKind = Literal[
    "follow",
    "friend_request",
    "friend_accept",
    "challenge_request",
    "challenge_accepted",
    "challenge_declined",
    "challenge_finished",
]


def _notify(
    user_id: str,
    actor_id: Optional[str],
    kind: str,
    challenge_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Insert a notification row. Self-targeting is skipped. Missing-schema
    errors are swallowed so the feature degrades gracefully when the
    multiplayer migration hasn't been applied."""
    if not user_id or user_id == actor_id:
        return
    sb = _sb()
    try:
        sb.table("notifications").insert({
            "user_id": user_id,
            "actor_id": actor_id,
            "kind": kind,
            "challenge_id": challenge_id,
            "payload": payload or {},
        }).execute()
    except Exception:
        # Non-fatal: don't break the underlying action because the notification
        # table is missing or RLS got in the way.
        pass


@router.get("/notifications")
@safe_read(lambda: {"items": [], "unread": 0})
async def list_notifications(
    user_id: str = Query(...),
    limit: int = Query(50, ge=1, le=100),
    since: Optional[str] = Query(None, description="ISO timestamp — only return notifications created strictly after this"),
) -> dict[str, Any]:
    sb = _sb()
    q = (
        sb.table("notifications").select("*")
        .eq("user_id", user_id).order("created_at", desc=True).limit(limit)
    )
    if since:
        q = q.gt("created_at", since)
    res = q.execute()
    rows = getattr(res, "data", None) or []
    actor_ids = [r["actor_id"] for r in rows if r.get("actor_id")]
    profs = _profile_lite_map(actor_ids)
    items = [
        {**r, "actor": _profile_lite_from(profs.get(r["actor_id"], {}), r["actor_id"]) if r.get("actor_id") else None}
        for r in rows
    ]
    unread_res = (
        sb.table("notifications").select("id", count="exact")
        .eq("user_id", user_id).eq("read", False).execute()
    )
    unread = getattr(unread_res, "count", 0) or 0
    return {"items": items, "unread": unread}


@router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    try:
        sb.table("notifications").update({"read": True}).eq("id", nid).eq("user_id", user_id).execute()
    except Exception as exc:
        if not _is_missing_schema(exc):
            raise
    return {"ok": "true"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    try:
        sb.table("notifications").update({"read": True}).eq("user_id", user_id).eq("read", False).execute()
    except Exception as exc:
        if not _is_missing_schema(exc):
            raise
    return {"ok": "true"}


# ============================================================
# Follows
# ============================================================

class FollowIn(BaseModel):
    followee_username: str


@router.post("/follows")
async def follow_user(body: FollowIn, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    _ensure_profile(user_id)
    target = _profile_by_username(body.followee_username)
    if not target:
        raise HTTPException(404, "user not found")
    if target["user_id"] == user_id:
        raise HTTPException(400, "cannot follow yourself")
    sb.table("follows").upsert(
        {"follower": user_id, "followee": target["user_id"]},
        on_conflict="follower,followee",
    ).execute()
    _push_activity(user_id, "started following", f"@{target['username']}")
    _notify(user_id=target["user_id"], actor_id=user_id, kind="follow", payload={})
    return {"ok": "true"}


@router.delete("/follows/{username}")
async def unfollow_user(username: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    target = _profile_by_username(username)
    if not target:
        return {"ok": "true"}
    sb.table("follows").delete().eq("follower", user_id).eq("followee", target["user_id"]).execute()
    return {"ok": "true"}


@router.get("/follows/following")
@safe_read(lambda: {"items": []})
async def list_following(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    res = sb.table("follows").select("followee").eq("follower", user_id).execute()
    ids = [r["followee"] for r in (getattr(res, "data", None) or [])]
    if not ids:
        return {"items": []}
    profs = (
        sb.table("profiles").select("user_id,username,display_name,avatar_seed,college,subjects,is_public")
        .in_("user_id", ids).execute()
    )
    return {"items": getattr(profs, "data", None) or []}


@router.get("/follows/followers")
@safe_read(lambda: {"items": []})
async def list_followers(username: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    target = _profile_by_username(username)
    if not target:
        raise HTTPException(404, "user not found")
    res = sb.table("follows").select("follower").eq("followee", target["user_id"]).execute()
    ids = [r["follower"] for r in (getattr(res, "data", None) or [])]
    if not ids:
        return {"items": []}
    profs = (
        sb.table("profiles").select("user_id,username,display_name,avatar_seed,college,subjects,is_public")
        .in_("user_id", ids).execute()
    )
    return {"items": getattr(profs, "data", None) or []}


# ============================================================
# Friend requests + friendships
# ============================================================

class FriendRequestIn(BaseModel):
    to_username: str


@router.post("/friends/requests")
async def send_friend_request(body: FriendRequestIn, user_id: str = Query(...)) -> dict[str, Any]:
    sb = _sb()
    _ensure_profile(user_id)
    target = _profile_by_username(body.to_username)
    if not target:
        raise HTTPException(404, "user not found")
    if target["user_id"] == user_id:
        raise HTTPException(400, "cannot friend yourself")
    # If they already sent ME a request, auto-accept.
    incoming = (
        sb.table("friend_requests").select("id")
        .eq("from_user", target["user_id"]).eq("to_user", user_id).eq("status", "pending")
        .limit(1).execute()
    )
    inc_rows = getattr(incoming, "data", None) or []
    if inc_rows:
        rid = inc_rows[0]["id"]
        return await accept_friend_request(rid, user_id=user_id)  # type: ignore[arg-type]
    ins = sb.table("friend_requests").insert({
        "from_user": user_id, "to_user": target["user_id"], "status": "pending",
    }).execute()
    req_row = (getattr(ins, "data", None) or [{}])[0]
    _notify(
        user_id=target["user_id"], actor_id=user_id, kind="friend_request",
        payload={"request_id": req_row.get("id")},
    )
    return {"ok": "true", "request": req_row}


@router.post("/friends/requests/{req_id}/accept")
async def accept_friend_request(req_id: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    res = sb.table("friend_requests").select("*").eq("id", req_id).maybe_single().execute()
    req = getattr(res, "data", None)
    if not req:
        raise HTTPException(404, "request not found")
    if req["to_user"] != user_id:
        raise HTTPException(403, "not the recipient")
    sb.table("friend_requests").update({"status": "accepted", "responded_at": "now()"}).eq("id", req_id).execute()
    sb.rpc("add_friendship", {"p_user1": req["from_user"], "p_user2": req["to_user"]}).execute()
    # Look up the other user's username for the activity row.
    other = sb.table("profiles").select("username").eq("user_id", req["from_user"]).maybe_single().execute()
    other_name = (getattr(other, "data", None) or {}).get("username")
    if other_name:
        _push_activity(user_id, "became friends with", f"@{other_name}")
    _notify(user_id=req["from_user"], actor_id=user_id, kind="friend_accept", payload={})
    return {"ok": "true"}


@router.post("/friends/requests/{req_id}/decline")
async def decline_friend_request(req_id: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    res = sb.table("friend_requests").select("from_user,to_user").eq("id", req_id).maybe_single().execute()
    req = getattr(res, "data", None)
    if not req:
        return {"ok": "true"}
    if user_id not in (req["from_user"], req["to_user"]):
        raise HTTPException(403, "not a party to this request")
    sb.table("friend_requests").update({"status": "declined", "responded_at": "now()"}).eq("id", req_id).execute()
    return {"ok": "true"}


@router.get("/friends")
@safe_read(lambda: {"items": []})
async def list_friends(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    res = (
        sb.table("friendships").select("user_a,user_b")
        .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}").execute()
    )
    rows = getattr(res, "data", None) or []
    others = [r["user_b"] if r["user_a"] == user_id else r["user_a"] for r in rows]
    if not others:
        return {"items": []}
    profs = (
        sb.table("profiles").select("user_id,username,display_name,avatar_seed,college,subjects")
        .in_("user_id", others).execute()
    )
    return {"items": getattr(profs, "data", None) or []}


@router.get("/friends/requests")
@safe_read(lambda: {"items": {"incoming": [], "outgoing": []}})
async def list_friend_requests(user_id: str = Query(...)) -> dict[str, dict[str, list[dict[str, Any]]]]:
    sb = _sb()
    incoming = (
        sb.table("friend_requests").select("id,from_user,created_at")
        .eq("to_user", user_id).eq("status", "pending").order("created_at", desc=True).execute()
    )
    outgoing = (
        sb.table("friend_requests").select("id,to_user,created_at")
        .eq("from_user", user_id).eq("status", "pending").order("created_at", desc=True).execute()
    )
    inc_rows = getattr(incoming, "data", None) or []
    out_rows = getattr(outgoing, "data", None) or []
    user_ids = list({r["from_user"] for r in inc_rows} | {r["to_user"] for r in out_rows})
    profs_map: dict[str, dict[str, Any]] = {}
    if user_ids:
        pr = sb.table("profiles").select("user_id,username,display_name,avatar_seed").in_("user_id", user_ids).execute()
        for p in getattr(pr, "data", None) or []:
            profs_map[p["user_id"]] = p
    return {
        "items": {
            "incoming": [{**r, "from": profs_map.get(r["from_user"], {"username": "unknown"})} for r in inc_rows],
            "outgoing": [{**r, "to": profs_map.get(r["to_user"], {"username": "unknown"})} for r in out_rows],
        }
    }


# ============================================================
# Challenges — multiplayer (server-owned questions + scores)
# ============================================================

QUESTION_COUNT = 5
TIME_LIMIT_S = 15
DEFAULT_PROGRESS = {
    "answers": [],
    "correct": 0,
    "wrong": 0,
    "completed": 0,
    "time_taken_ms": 0,
    "score": 0,
    "done": False,
}


class ChallengeIn(BaseModel):
    to_username: str
    mode: ChallengeMode = "1v1"
    document_id: Optional[str] = None
    chapter: Optional[str] = None


def _challenge_progress_key(row: dict[str, Any], user_id: str) -> str:
    return "progress_from" if row["from_user"] == user_id else "progress_to"


def _frozen_quiz_items(
    document_id: Optional[str],
    fallback_user_ids: Optional[list[str]] = None,
    count: int = QUESTION_COUNT,
) -> list[dict[str, Any]]:
    """Pull quiz artifacts for a document, shuffle once, and freeze a fixed
    subset that BOTH players will play. The returned list is the source of
    truth for the entire battle — never regenerated.

    If `document_id` is missing or that document has no quizzes, fall back to
    any quiz artifacts from the documents owned by `fallback_user_ids` (the
    two players of the challenge) so non-doc modes like 1v1/random can still
    produce a playable question set."""
    sb = _sb()
    rows: list[dict[str, Any]] = []
    if document_id:
        try:
            res = (
                sb.table("artifacts").select("id,payload")
                .eq("document_id", document_id).eq("type", "quiz").execute()
            )
            rows = getattr(res, "data", None) or []
        except Exception:
            rows = []
    if not rows and fallback_user_ids:
        try:
            doc_res = (
                sb.table("documents").select("id")
                .in_("user_id", fallback_user_ids).limit(50).execute()
            )
            doc_ids = [d["id"] for d in (getattr(doc_res, "data", None) or [])]
            if doc_ids:
                # We only need `count` items; pull a small pool (3× target) for
                # variety and shuffle. Heavy payloads + huge limits made the
                # accept handshake slow enough that the client poll could time
                # out before the server finished.
                pool_size = max(count * 3, 15)
                art_res = (
                    sb.table("artifacts").select("id,payload")
                    .in_("document_id", doc_ids).eq("type", "quiz").limit(pool_size).execute()
                )
                rows = getattr(art_res, "data", None) or []
        except Exception:
            pass
    random.shuffle(rows)
    return rows[:count]


def _doc_subject(document_id: Optional[str]) -> Optional[str]:
    if not document_id:
        return None
    sb = _sb()
    try:
        res = sb.table("documents").select("title").eq("id", document_id).maybe_single().execute()
        title = (getattr(res, "data", None) or {}).get("title")
        return title
    except Exception:
        return None


def _profile_lite(user_id: str) -> dict[str, Any]:
    p = _profile_by_user_id(user_id) or {}
    return _profile_lite_from(p, fallback_user_id=user_id)


def _profile_lite_from(p: dict[str, Any], fallback_user_id: str = "") -> dict[str, Any]:
    return {
        "user_id": p.get("user_id", fallback_user_id),
        "username": p.get("username") or "unknown",
        "display_name": p.get("display_name") or p.get("username") or "unknown",
        "avatar_seed": p.get("avatar_seed") or fallback_user_id,
    }


def _profile_lite_map(user_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Batch-fetch profile lites for several user_ids in one query."""
    sb = _sb()
    unique = list({u for u in user_ids if u})
    if not unique:
        return {}
    try:
        res = (
            sb.table("profiles").select("user_id,username,display_name,avatar_seed")
            .in_("user_id", unique).execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception as exc:
        if _is_missing_schema(exc):
            return {}
        raise
    return {r["user_id"]: r for r in rows}


def _decorate_challenge(row: dict[str, Any], requester_id: Optional[str] = None) -> dict[str, Any]:
    """Attach `from` / `to` profile lites and fill in default shapes for any
    multiplayer columns that the migration hasn't yet added (so the frontend
    can always render a full row). Withhold quiz_items while still pending."""
    profs = _profile_lite_map([row["from_user"], row["to_user"]])
    out = {
        **row,
        "from": _profile_lite_from(profs.get(row["from_user"], {}), row["from_user"]),
        "to": _profile_lite_from(profs.get(row["to_user"], {}), row["to_user"]),
    }
    out.setdefault("progress_from", dict(DEFAULT_PROGRESS))
    out.setdefault("progress_to", dict(DEFAULT_PROGRESS))
    out.setdefault("question_count", QUESTION_COUNT)
    out.setdefault("time_limit_s", TIME_LIMIT_S)
    out.setdefault("subject", None)
    out.setdefault("quiz_items", None)
    if row.get("status") == "pending":
        out["quiz_items"] = None
    return out


@router.post("/challenges")
async def create_challenge(body: ChallengeIn, user_id: str = Query(...)) -> dict[str, Any]:
    """Create a PENDING challenge — questions are not generated yet. The
    recipient must accept before quiz_items are frozen and the room becomes
    in_progress."""
    sb = _sb()
    _ensure_profile(user_id)
    target = _profile_by_username(body.to_username)
    if not target:
        raise HTTPException(404, "user not found")
    if target["user_id"] == user_id:
        raise HTTPException(400, "cannot challenge yourself")
    payload: dict[str, Any] = {
        "from_user": user_id,
        "to_user": target["user_id"],
        "mode": body.mode,
        "document_id": body.document_id,
        "chapter": body.chapter,
        "status": "pending",
        "question_count": QUESTION_COUNT,
        "time_limit_s": TIME_LIMIT_S,
        "subject": _doc_subject(body.document_id),
    }
    ins = sb.table("challenges").insert(payload).execute()
    row = (getattr(ins, "data", None) or [{}])[0]
    _notify(
        user_id=target["user_id"], actor_id=user_id, kind="challenge_request",
        challenge_id=row.get("id"), payload={
            "mode": body.mode, "subject": payload.get("subject"), "document_id": body.document_id,
        },
    )
    return {"ok": "true", "challenge": _decorate_challenge(row, user_id)}


@router.get("/challenges/{cid}")
@safe_read(lambda: {})
async def get_challenge(cid: str, user_id: str = Query(...)) -> dict[str, Any]:
    sb = _sb()
    res = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "challenge not found")
    if user_id not in (row["from_user"], row["to_user"]):
        raise HTTPException(403, "not a party to this challenge")
    return _decorate_challenge(row, user_id)


@router.post("/challenges/{cid}/accept")
async def accept_challenge(cid: str, user_id: str = Query(...)) -> dict[str, Any]:
    """Recipient accepts: freeze quiz_items (once), flip to in_progress, set
    started_at. Subsequent calls are idempotent — quiz_items don't regenerate."""
    sb = _sb()
    res = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "challenge not found")
    if row["to_user"] != user_id:
        raise HTTPException(403, "only the recipient can accept")
    if row.get("status") in ("declined", "cancelled", "expired"):
        raise HTTPException(409, f"challenge is {row['status']}")
    update: dict[str, Any] = {}
    if not row.get("quiz_items"):
        items = _frozen_quiz_items(
            row.get("document_id"),
            fallback_user_ids=[row["from_user"], row["to_user"]],
        )
        if not items:
            raise HTTPException(
                422,
                "no quiz questions available — upload a document with quizzes first, then send the challenge again",
            )
        update["quiz_items"] = items
    if row.get("status") in ("pending", "accepted"):
        update["status"] = "in_progress"
        update["accepted_at"] = "now()"
        update["started_at"] = "now()"
        # Reset progress in case of replay
        update["progress_from"] = DEFAULT_PROGRESS
        update["progress_to"] = DEFAULT_PROGRESS
    if update:
        sb.table("challenges").update(update).eq("id", cid).execute()
    fresh = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    new_row = getattr(fresh, "data", None) or row
    _notify(
        user_id=row["from_user"], actor_id=user_id, kind="challenge_accepted",
        challenge_id=cid, payload={"subject": row.get("subject")},
    )
    return {"ok": "true", "challenge": _decorate_challenge(new_row, user_id)}


@router.post("/challenges/{cid}/decline")
async def decline_challenge(cid: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    res = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "challenge not found")
    if user_id not in (row["from_user"], row["to_user"]):
        raise HTTPException(403, "not a party to this challenge")
    sb.table("challenges").update({
        "status": "declined" if user_id == row["to_user"] else "cancelled",
        "declined_at": "now()",
    }).eq("id", cid).execute()
    other = row["from_user"] if user_id == row["to_user"] else row["to_user"]
    _notify(
        user_id=other, actor_id=user_id,
        kind="challenge_declined", challenge_id=cid, payload={},
    )
    return {"ok": "true"}


class AnswerIn(BaseModel):
    question_index: int = Field(..., ge=0)
    option_index: int = Field(..., ge=0)
    time_ms: int = Field(0, ge=0)


@router.post("/challenges/{cid}/answer")
async def submit_answer(cid: str, body: AnswerIn, user_id: str = Query(...)) -> dict[str, Any]:
    """Server validates the answer against the frozen quiz_items and updates
    only the calling player's progress. Returns the updated challenge so both
    clients see identical numbers."""
    sb = _sb()
    res = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "challenge not found")
    if user_id not in (row["from_user"], row["to_user"]):
        raise HTTPException(403, "not a party to this challenge")
    if row.get("status") != "in_progress":
        raise HTTPException(409, f"challenge is {row.get('status')}")
    items = row.get("quiz_items") or []
    if body.question_index >= len(items):
        raise HTTPException(422, "question index out of range")
    key = _challenge_progress_key(row, user_id)
    progress = dict(row.get(key) or DEFAULT_PROGRESS)
    answers: list[dict[str, Any]] = list(progress.get("answers") or [])
    # Reject duplicate submission for the same question
    if any(a.get("q") == body.question_index for a in answers):
        raise HTTPException(409, "already answered this question")
    item = items[body.question_index]
    correct_idx = ((item.get("payload") or {}).get("answer_index"))
    is_correct = correct_idx is not None and body.option_index == correct_idx
    answers.append({
        "q": body.question_index, "pick": body.option_index,
        "correct": is_correct, "time_ms": body.time_ms,
    })
    progress["answers"] = answers
    progress["correct"] = int(progress.get("correct", 0)) + (1 if is_correct else 0)
    progress["wrong"] = int(progress.get("wrong", 0)) + (0 if is_correct else 1)
    progress["completed"] = len(answers)
    progress["time_taken_ms"] = int(progress.get("time_taken_ms", 0)) + body.time_ms
    progress["score"] = progress["correct"]  # 1pt per correct
    progress["done"] = progress["completed"] >= len(items)
    update: dict[str, Any] = {key: progress}
    # If BOTH players are done, auto-finish.
    other_key = "progress_to" if key == "progress_from" else "progress_from"
    other = row.get(other_key) or DEFAULT_PROGRESS
    if progress["done"] and other.get("done"):
        # NOTE: the challenge_status enum has 'finished', not 'completed'.
        # Writing 'completed' here used to make the UPDATE fail mid-transaction,
        # which surfaced to the client as a network-level "Failed to fetch"
        # because the 500 response had no CORS headers attached.
        update["status"] = "finished"
        update["finished_at"] = "now()"
        update["wins_from"] = (row.get("progress_from") if key == "progress_to" else progress).get("score") or 0
        update["wins_to"] = (row.get("progress_to") if key == "progress_from" else progress).get("score") or 0
    sb.table("challenges").update(update).eq("id", cid).execute()
    # Build the response row from the local update so we never depend on a
    # second roundtrip for correctness. The fresh re-fetch is best-effort —
    # if it fails we still return a valid, consistent row.
    new_row = {**row, **update}
    try:
        fresh = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
        fetched = getattr(fresh, "data", None)
        if fetched:
            new_row = fetched
    except Exception:
        log.exception("submit_answer: fresh fetch failed; using local merge")
    # Side effects after a finished match must NEVER crash the answer response —
    # activity rows + notifications are decorative; the player needs their score
    # update to land.
    if update.get("status") == "finished":
        try:
            _on_challenge_finish(new_row)
        except Exception:
            log.exception("submit_answer: _on_challenge_finish failed")
    try:
        decorated = _decorate_challenge(new_row, user_id)
    except Exception:
        log.exception("submit_answer: _decorate_challenge failed; returning raw row")
        decorated = new_row
    return {"ok": "true", "challenge": decorated}


def _on_challenge_finish(row: dict[str, Any]) -> None:
    wins_from = int(row.get("wins_from") or 0)
    wins_to = int(row.get("wins_to") or 0)
    a, b = row["from_user"], row["to_user"]
    # Profile lookups must never fail this routine — fall back to "opponent"
    # so the activity feed still gets the win/loss/tie line.
    def _name(uid: str) -> str:
        try:
            return (_profile_by_user_id(uid) or {}).get("username") or "opponent"
        except Exception:
            log.exception("_on_challenge_finish: profile lookup failed for %s", uid)
            return "opponent"
    from_name = _name(a)
    to_name = _name(b)
    if wins_from > wins_to:
        _push_activity(a, "won a quiz battle vs", f"@{to_name}")
        _push_activity(b, "lost a quiz battle vs", f"@{from_name}")
    elif wins_to > wins_from:
        _push_activity(b, "won a quiz battle vs", f"@{from_name}")
        _push_activity(a, "lost a quiz battle vs", f"@{to_name}")
    else:
        _push_activity(a, "tied a quiz battle with", f"@{to_name}")
        _push_activity(b, "tied a quiz battle with", f"@{from_name}")
    payload = {"wins_from": wins_from, "wins_to": wins_to}
    _notify(user_id=a, actor_id=b, kind="challenge_finished", challenge_id=row["id"], payload=payload)
    _notify(user_id=b, actor_id=a, kind="challenge_finished", challenge_id=row["id"], payload=payload)


class FinishChallengeIn(BaseModel):
    """Legacy client-finish endpoint kept for backwards compat — preferred path
    is per-answer submission which auto-finishes on the server."""
    wins_from: int = Field(..., ge=0)
    wins_to: int = Field(..., ge=0)


@router.post("/challenges/{cid}/finish")
async def finish_challenge(cid: str, body: FinishChallengeIn, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    res = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "challenge not found")
    if user_id not in (row["from_user"], row["to_user"]):
        raise HTTPException(403, "not a party to this challenge")
    if row.get("status") in ("finished", "declined", "cancelled", "expired"):
        return {"ok": "true"}
    sb.table("challenges").update({
        "status": "finished",
        "wins_from": body.wins_from,
        "wins_to": body.wins_to,
        "finished_at": "now()",
    }).eq("id", cid).execute()
    fresh = sb.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    new_row = getattr(fresh, "data", None) or row
    _on_challenge_finish(new_row)
    return {"ok": "true"}


@router.get("/challenges")
@safe_read(lambda: {"items": []})
async def list_challenges(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    res = (
        sb.table("challenges").select("*")
        .or_(f"from_user.eq.{user_id},to_user.eq.{user_id}")
        .order("created_at", desc=True).limit(50).execute()
    )
    rows = getattr(res, "data", None) or []
    user_ids = list({r["from_user"] for r in rows} | {r["to_user"] for r in rows})
    profs_map: dict[str, dict[str, Any]] = {}
    if user_ids:
        pr = sb.table("profiles").select("user_id,username,display_name,avatar_seed").in_("user_id", user_ids).execute()
        for p in getattr(pr, "data", None) or []:
            profs_map[p["user_id"]] = p
    out = []
    for r in rows:
        out.append({
            **r,
            "from": profs_map.get(r["from_user"], {"username": "unknown"}),
            "to": profs_map.get(r["to_user"], {"username": "unknown"}),
        })
    return {"items": out}


# ============================================================
# Bookmarks
# ============================================================

class BookmarkIn(BaseModel):
    artifact_id: str


@router.post("/bookmarks")
async def add_bookmark(body: BookmarkIn, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    sb.table("bookmarks").upsert(
        {"user_id": user_id, "artifact_id": body.artifact_id},
        on_conflict="user_id,artifact_id",
    ).execute()
    return {"ok": "true"}


@router.delete("/bookmarks/{artifact_id}")
async def remove_bookmark(artifact_id: str, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    sb.table("bookmarks").delete().eq("user_id", user_id).eq("artifact_id", artifact_id).execute()
    return {"ok": "true"}


@router.get("/bookmarks")
@safe_read(lambda: {"items": []})
async def list_bookmarks(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    res = sb.table("bookmarks").select("artifact_id,created_at").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"items": getattr(res, "data", None) or []}


# ============================================================
# Path progress
# ============================================================

class PathProgressIn(BaseModel):
    document_id: str
    step_order: int = Field(..., ge=1)
    status: PathStatus
    pct: int = Field(0, ge=0, le=100)


@router.get("/path-progress")
@safe_read(lambda: {"items": []})
async def list_path_progress(user_id: str = Query(...)) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    res = sb.table("path_progress").select("*").eq("user_id", user_id).execute()
    return {"items": getattr(res, "data", None) or []}


@router.put("/path-progress")
async def upsert_path_progress(body: PathProgressIn, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    payload: dict[str, Any] = {
        "user_id": user_id,
        "document_id": body.document_id,
        "step_order": body.step_order,
        "status": body.status,
        "pct": body.pct,
        "updated_at": "now()",
    }
    if body.status == "completed":
        payload["completed_at"] = "now()"
    sb.table("path_progress").upsert(
        payload, on_conflict="user_id,document_id,step_order",
    ).execute()
    return {"ok": "true"}


# ============================================================
# Document visibility
# ============================================================

class DocVisibilityIn(BaseModel):
    visibility: Visibility


@router.put("/doc-visibility/{doc_id}")
async def set_doc_visibility(doc_id: str, body: DocVisibilityIn, user_id: str = Query(...)) -> dict[str, str]:
    sb = _sb()
    owner = sb.table("documents").select("user_id").eq("id", doc_id).maybe_single().execute()
    row = getattr(owner, "data", None)
    if not row:
        raise HTTPException(404, "document not found")
    if row["user_id"] != user_id:
        raise HTTPException(403, "not the owner")
    sb.table("documents").update({"visibility": body.visibility}).eq("id", doc_id).execute()
    return {"ok": "true"}


@router.get("/doc-visibility")
@safe_read(lambda: {"items": {}})
async def list_doc_visibility(user_id: str = Query(...)) -> dict[str, dict[str, str]]:
    sb = _sb()
    res = sb.table("documents").select("id,visibility").eq("user_id", user_id).execute()
    rows = getattr(res, "data", None) or []
    return {"items": {r["id"]: r["visibility"] for r in rows}}


# ============================================================
# Privacy settings
# ============================================================

class PrivacyIn(BaseModel):
    profile: Optional[Visibility] = None
    uploads: Optional[Visibility] = None
    followers: Optional[Visibility] = None
    activity: Optional[Visibility] = None
    quiz_records: Optional[Visibility] = None
    achievements: Optional[Visibility] = None
    leaderboard: Optional[bool] = None


@router.get("/privacy")
@safe_read(lambda: {})
async def get_privacy(user_id: str = Query(...)) -> dict[str, Any]:
    sb = _sb()
    _ensure_profile(user_id)
    res = sb.table("privacy_settings").select("*").eq("user_id", user_id).maybe_single().execute()
    row = getattr(res, "data", None)
    if not row:
        sb.table("privacy_settings").insert({"user_id": user_id}).execute()
        res = sb.table("privacy_settings").select("*").eq("user_id", user_id).maybe_single().execute()
        row = getattr(res, "data", None)
    return row or {}


@router.put("/privacy")
async def update_privacy(body: PrivacyIn, user_id: str = Query(...)) -> dict[str, Any]:
    sb = _sb()
    _ensure_profile(user_id)
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        return await get_privacy(user_id=user_id)  # type: ignore[arg-type]
    data["updated_at"] = "now()"
    sb.table("privacy_settings").upsert(
        {"user_id": user_id, **data}, on_conflict="user_id",
    ).execute()
    return await get_privacy(user_id=user_id)  # type: ignore[arg-type]


# ============================================================
# Social activity feed
# ============================================================

class ActivityIn(BaseModel):
    verb: str
    object: str


def _push_activity(actor_id: str, verb: str, object_text: str) -> None:
    sb = _sb()
    try:
        # Skip if the actor has hidden_activity = true.
        prof = sb.table("profiles").select("hidden_activity").eq("user_id", actor_id).maybe_single().execute()
        if (getattr(prof, "data", None) or {}).get("hidden_activity"):
            return
        sb.table("social_activity").insert({
            "actor": actor_id, "verb": verb, "object_text": object_text,
        }).execute()
    except Exception:
        # Non-fatal — activity is decorative.
        pass


@router.post("/activity")
async def post_activity(body: ActivityIn, user_id: str = Query(...)) -> dict[str, str]:
    _push_activity(user_id, body.verb, body.object)
    return {"ok": "true"}


@router.get("/activity")
@safe_read(lambda: {"items": []})
async def get_activity(
    user_id: str = Query(...),
    scope: Literal["all", "mine", "following", "friends"] = "all",
    limit: int = 80,
) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    _ensure_profile(user_id)
    q = sb.table("social_activity").select("*").order("ts", desc=True).limit(limit)
    if scope == "mine":
        q = q.eq("actor", user_id)
    elif scope == "following":
        f = sb.table("follows").select("followee").eq("follower", user_id).execute()
        ids = [r["followee"] for r in (getattr(f, "data", None) or [])]
        if not ids:
            return {"items": []}
        q = q.in_("actor", ids)
    elif scope == "friends":
        f = sb.table("friendships").select("user_a,user_b").or_(f"user_a.eq.{user_id},user_b.eq.{user_id}").execute()
        rows = getattr(f, "data", None) or []
        ids = [r["user_b"] if r["user_a"] == user_id else r["user_a"] for r in rows]
        if not ids:
            return {"items": []}
        q = q.in_("actor", ids)
    res = q.execute()
    rows = getattr(res, "data", None) or []
    actor_ids = list({r["actor"] for r in rows})
    profs_map: dict[str, dict[str, Any]] = {}
    if actor_ids:
        pr = sb.table("profiles").select("user_id,username,display_name,avatar_seed").in_("user_id", actor_ids).execute()
        for p in getattr(pr, "data", None) or []:
            profs_map[p["user_id"]] = p
    out = []
    for r in rows:
        prof = profs_map.get(r["actor"], {})
        out.append({
            **r,
            "actor_username": prof.get("username") or "unknown",
            "actor_display_name": prof.get("display_name") or prof.get("username") or "unknown",
            "actor_avatar_seed": prof.get("avatar_seed") or r["actor"],
        })
    return {"items": out}


# ============================================================
# Leaderboard
# ============================================================

@router.get("/leaderboard")
@safe_read(lambda: {"items": []})
async def leaderboard(
    user_id: Optional[str] = None,
    scope: Literal["global", "friends", "college", "subject"] = "global",
    subject: Optional[str] = None,
    limit: int = 50,
) -> dict[str, list[dict[str, Any]]]:
    sb = _sb()
    profs = sb.table("profiles").select("*").eq("is_public", True).execute()
    rows: list[dict[str, Any]] = getattr(profs, "data", None) or []
    if scope == "subject":
        if not subject:
            return {"items": []}
        rows = [r for r in rows if subject in (r.get("subjects") or [])]
    elif scope == "college" and user_id:
        me = _profile_by_user_id(user_id)
        col = (me or {}).get("college") if me else None
        if not col:
            return {"items": []}
        rows = [r for r in rows if r.get("college") == col]
    elif scope == "friends" and user_id:
        f = (
            sb.table("friendships").select("user_a,user_b")
            .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}").execute()
        )
        frows = getattr(f, "data", None) or []
        ids = {user_id} | {r["user_b"] if r["user_a"] == user_id else r["user_a"] for r in frows}
        rows = [r for r in rows if r["user_id"] in ids]

    # Exclude users who opted out.
    if rows:
        priv = sb.table("privacy_settings").select("user_id,leaderboard").in_("user_id", [r["user_id"] for r in rows]).execute()
        opt_out = {p["user_id"] for p in (getattr(priv, "data", None) or []) if not p.get("leaderboard", True)}
        rows = [r for r in rows if r["user_id"] not in opt_out]

    enriched = [_hydrate_profile(p) for p in rows]
    enriched.sort(key=lambda p: -int(p.get("xp", 0)))
    return {"items": enriched[:limit]}
