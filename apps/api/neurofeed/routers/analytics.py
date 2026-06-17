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
