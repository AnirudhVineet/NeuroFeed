"""Gamification read API. State is derived from learning_events on every call."""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..services.gamify import get_state

router = APIRouter(prefix="/api/gamify", tags=["gamify"])


@router.get("/state")
async def state(user_id: str = Query(...)) -> dict:
    s = get_state(user_id)
    return {
        "xp_total": s.xp_total,
        "xp_today": s.xp_today,
        "daily_goal_xp": s.daily_goal_xp,
        "daily_goal_pct": s.daily_goal_pct,
        "streak": s.streak,
        "achievements": s.achievements,
    }
