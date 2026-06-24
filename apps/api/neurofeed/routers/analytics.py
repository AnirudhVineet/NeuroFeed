"""Analytics: mastery rows, daily XP series, activity proxy."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..deps import get_supabase_admin
from ..services.gamify import DAILY_XP_CAP, xp_for_event

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

DAYS = 14


@router.get("")
async def analytics(user_id: str = Query(...)) -> dict[str, Any]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    since = (datetime.now(timezone.utc) - timedelta(days=DAYS)).isoformat()
    evt_res = (
        sb.table("learning_events")
        .select("type,payload,ts")
        .eq("user_id", user_id)
        .gte("ts", since)
        .order("ts", desc=False)
        .limit(5000)
        .execute()
    )
    events = getattr(evt_res, "data", None) or []

    # XP curve
    by_day_xp: dict[str, int] = {}
    by_day_events: dict[str, int] = {}
    for e in events:
        ts = e.get("ts")
        if not ts:
            continue
        try:
            d = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(timezone.utc).date()
        except Exception:
            continue
        key = d.isoformat()
        by_day_xp[key] = min(DAILY_XP_CAP, by_day_xp.get(key, 0) + xp_for_event(e))
        by_day_events[key] = by_day_events.get(key, 0) + 1

    today = datetime.now(timezone.utc).date()
    xp_series = []
    activity_series = []
    for i in range(DAYS - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        xp_series.append({"date": d, "xp": by_day_xp.get(d, 0)})
        activity_series.append({"date": d, "events": by_day_events.get(d, 0)})

    # Mastery
    m_res = (
        sb.table("mastery")
        .select("concept_id,score,updated_at")
        .eq("user_id", user_id)
        .execute()
    )
    mastery_rows = getattr(m_res, "data", None) or []
    if mastery_rows:
        c_res = (
            sb.table("concepts")
            .select("id,name")
            .in_("id", [r["concept_id"] for r in mastery_rows])
            .execute()
        )
        name_by_id = {r["id"]: r["name"] for r in getattr(c_res, "data", None) or []}
        for r in mastery_rows:
            r["name"] = name_by_id.get(r["concept_id"], r["concept_id"])

    return {
        "xp_series": xp_series,
        "activity_series": activity_series,
        "mastery": sorted(mastery_rows, key=lambda r: r.get("score", 0), reverse=True),
    }


@router.get("/stats")
async def stats(user_id: str = Query(...)) -> dict[str, Any]:
    """Top-line counters for the dashboard hero strip.

    Aggregates over all-time events so the user sees lifetime totals, not
    just the rolling 14-day analytics window.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    # Document + reel counts come straight from row aggregates.
    docs_res = (
        sb.table("documents")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    total_uploads = int(getattr(docs_res, "count", None) or 0)

    doc_ids: list[str] = [d["id"] for d in (getattr(docs_res, "data", None) or [])]
    total_reels = 0
    if doc_ids:
        reels_res = (
            sb.table("artifacts")
            .select("id", count="exact")
            .in_("document_id", doc_ids)
            .eq("type", "reel_script")
            .execute()
        )
        total_reels = int(getattr(reels_res, "count", None) or 0)

    # Event-derived stats. Pull only the columns/types we need.
    evt_res = (
        sb.table("learning_events")
        .select("type,payload")
        .eq("user_id", user_id)
        .in_("type", ["quiz_answer", "reel_complete"])
        .limit(10000)
        .execute()
    )
    quizzes_completed = 0
    quizzes_correct = 0
    reels_watched = 0
    seconds_watched = 0.0
    for e in getattr(evt_res, "data", None) or []:
        t = e["type"]
        payload = e.get("payload") or {}
        if t == "quiz_answer":
            quizzes_completed += 1
            if payload.get("correct"):
                quizzes_correct += 1
        elif t == "reel_complete":
            reels_watched += 1
            dur = payload.get("duration_sec")
            if isinstance(dur, (int, float)) and dur > 0:
                seconds_watched += float(dur)
            else:
                # Fallback estimate: most reels run ~45s of actual narration.
                seconds_watched += 45.0

    return {
        "total_uploads": total_uploads,
        "total_reels": total_reels,
        "reels_watched": reels_watched,
        "seconds_watched": int(seconds_watched),
        "quizzes_completed": quizzes_completed,
        "quizzes_correct": quizzes_correct,
    }
