"""Per-card actions: events, explain-simpler, quiz-by-concept."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..deps import get_supabase_admin
from ..services.llm.json_gen import generate_json
from ..services.llm.router import fallback_client, route_client
from ..services.mastery import recompute_for_user

router = APIRouter(prefix="/api", tags=["actions"])


# ---------- Events ----------
EventType = Literal[
    "upload", "view", "like", "save", "quiz_answer",
    "flashcard_review", "reel_complete", "tutor_query", "explain_simpler",
]


class EventIn(BaseModel):
    user_id: str
    type: EventType
    payload: dict[str, Any] = {}


@router.post("/events")
async def post_event(evt: EventIn) -> dict[str, str]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    sb.table("learning_events").insert(
        {"user_id": evt.user_id, "type": evt.type, "payload": evt.payload}
    ).execute()
    if evt.type in {"quiz_answer", "flashcard_review"}:
        try:
            recompute_for_user(evt.user_id)
        except Exception:
            pass
    return {"ok": "true"}


# ---------- Explain simpler ----------
class ExplainSimplerIn(BaseModel):
    artifact_id: str
    user_id: str | None = None


class ExplainSimplerOut(BaseModel):
    title: str
    body: str


@router.post("/explain-simpler", response_model=ExplainSimplerOut)
async def explain_simpler(req: ExplainSimplerIn) -> ExplainSimplerOut:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    res = sb.table("artifacts").select("type,payload").eq("id", req.artifact_id).single().execute()
    art = getattr(res, "data", None)
    if not art:
        raise HTTPException(404, "artifact not found")

    body_seed = _seed_text_from_artifact(art["type"], art["payload"])
    if not body_seed:
        raise HTTPException(422, "artifact has no explainable text")

    system = (
        "You rewrite study content so a complete beginner gets it. Keep it accurate. "
        "Use plain language. Avoid jargon unless you define it in the same sentence.\n"
        'Schema: {"title": str (<=60 chars), "body": str (<=200 chars)}'
    )

    client, provider = route_client(human_waiting=True)
    if client is None:
        raise HTTPException(503, "no LLM provider configured")
    try:
        data = await generate_json(
            client=client, system=system, user=body_seed, provider=provider, max_tokens=400,
        )
    except Exception:
        # Fallback on Groq 429 / outage
        client2, provider2 = fallback_client(provider)
        if client2 is None:
            raise
        data = await generate_json(
            client=client2, system=system, user=body_seed, provider=provider2, max_tokens=400,
        )

    if req.user_id:
        try:
            sb.table("learning_events").insert({
                "user_id": req.user_id, "type": "explain_simpler",
                "payload": {"artifact_id": req.artifact_id},
            }).execute()
        except Exception:
            pass

    return ExplainSimplerOut(title=str(data.get("title", "")), body=str(data.get("body", "")))


def _seed_text_from_artifact(type_: str, payload: dict[str, Any]) -> str:
    if type_ == "swipe_card":
        return f"{payload.get('title','')}\n\n{payload.get('body','')}".strip()
    if type_ == "flashcard":
        return f"Q: {payload.get('question','')}\nA: {payload.get('answer','')}"
    if type_ == "quiz":
        return f"Question: {payload.get('stem','')}\nExplanation: {payload.get('explanation','')}"
    if type_ == "summary":
        bullets = "\n- ".join(payload.get("bullets") or [])
        return f"{payload.get('tldr','')}\n- {bullets}"
    return str(payload)


# ---------- Quiz me by concept ----------
@router.get("/quiz/by-concept/{concept_id}")
async def quiz_by_concept(concept_id: str, limit: int = 5) -> dict[str, list[dict[str, Any]]]:
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    # Concepts attach to a document; quizzes don't always carry concept_id (we store
    # quiz items with concept_id=null today). We approximate by pulling quizzes from
    # the same document as the concept.
    c = sb.table("concepts").select("document_id,name").eq("id", concept_id).single().execute()
    crow = getattr(c, "data", None)
    if not crow:
        raise HTTPException(404, "concept not found")
    q = (
        sb.table("artifacts")
        .select("id,payload")
        .eq("document_id", crow["document_id"])
        .eq("type", "quiz")
        .limit(limit)
        .execute()
    )
    return {"items": getattr(q, "data", None) or []}
