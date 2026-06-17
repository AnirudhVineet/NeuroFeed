"""Event-sourced gamification: XP, streaks, daily goal, achievements.

All inputs come from learning_events. No mutation here — every getter recomputes
from the source of truth, which keeps the demo bulletproof when seeds change.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from ..deps import get_supabase_admin

# XP awards per event type
XP_AWARDS: dict[str, int] = {
    "quiz_answer_correct": 15,
    "quiz_answer_wrong": 3,
    "flashcard_review": 5,
    "reel_complete": 10,
    "tutor_query": 4,
    "explain_simpler": 2,
    "like": 1,
    "save": 2,
    "upload": 25,
}

DAILY_XP_CAP = 200
DAILY_GOAL_XP = 60
STREAK_FREEZE_GRACE_DAYS = 1


@dataclass
class GamifyState:
    xp_total: int
    xp_today: int
    daily_goal_xp: int
    daily_goal_pct: float
    streak: int
    achievements: list[str]


# ---------- Achievement rules (static, evaluated against event history) ----------
def _achievements(events: list[dict[str, Any]]) -> list[str]:
    earned: list[str] = []

    upload_count = sum(1 for e in events if e["type"] == "upload")
    quiz_correct = sum(
        1 for e in events if e["type"] == "quiz_answer" and (e.get("payload") or {}).get("correct")
    )
    reels = sum(1 for e in events if e["type"] == "reel_complete")
    tutor = sum(1 for e in events if e["type"] == "tutor_query")

    if upload_count >= 1:
        earned.append("first_upload")
    if quiz_correct >= 5:
        earned.append("quiz_5")
    if quiz_correct >= 25:
        earned.append("quiz_25")
    if reels >= 3:
        earned.append("binge_3")
    if tutor >= 10:
        earned.append("curious_10")
    return earned


# ---------- XP ----------
def _xp_for_event(e: dict[str, Any]) -> int:
    t = e["type"]
    payload = e.get("payload") or {}
    if t == "quiz_answer":
        return XP_AWARDS["quiz_answer_correct"] if payload.get("correct") else XP_AWARDS["quiz_answer_wrong"]
    return XP_AWARDS.get(t, 0)


def _cap_daily(events: list[dict[str, Any]]) -> dict[date, int]:
    by_day: dict[date, int] = {}
    for e in events:
        ts = e.get("ts")
        if not ts:
            continue
        try:
            d = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(timezone.utc).date()
        except Exception:
            continue
        by_day[d] = min(DAILY_XP_CAP, by_day.get(d, 0) + _xp_for_event(e))
    return by_day


def _streak(by_day: dict[date, int]) -> int:
    if not by_day:
        return 0
    today = datetime.now(timezone.utc).date()
    streak = 0
    cursor = today
    grace = STREAK_FREEZE_GRACE_DAYS
    while True:
        hit = by_day.get(cursor, 0) >= 1
        if hit:
            streak += 1
            cursor -= timedelta(days=1)
            continue
        # allow one grace day before breaking the streak
        if grace > 0 and cursor != today:
            grace -= 1
            cursor -= timedelta(days=1)
            continue
        break
    return streak


def get_state(user_id: str) -> GamifyState:
    sb = get_supabase_admin()
    events: list[dict[str, Any]] = []
    if sb is not None:
        res = (
            sb.table("learning_events")
            .select("type,payload,ts")
            .eq("user_id", user_id)
            .order("ts", desc=False)
            .limit(5000)
            .execute()
        )
        events = getattr(res, "data", None) or []

    by_day = _cap_daily(events)
    today = datetime.now(timezone.utc).date()
    xp_today = by_day.get(today, 0)
    xp_total = sum(by_day.values())
    streak = _streak(by_day)
    pct = min(1.0, xp_today / DAILY_GOAL_XP) if DAILY_GOAL_XP else 0.0
    achievements = _achievements(events)

    return GamifyState(
        xp_total=xp_total,
        xp_today=xp_today,
        daily_goal_xp=DAILY_GOAL_XP,
        daily_goal_pct=pct,
        streak=streak,
        achievements=achievements,
    )
