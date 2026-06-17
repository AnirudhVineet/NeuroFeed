"""Per-concept mastery (EMA 0..1). Recomputed from learning_events on demand."""
from __future__ import annotations

from typing import Any

from ..deps import get_supabase_admin

ALPHA = 0.3
# Concept resolution: quiz items don't carry a concept_id today, so we use the
# artifact's concept_id if present and fall back to the document's primary concept.


def _signal_for_event(e: dict[str, Any]) -> float | None:
    """Return the 0..1 score this event contributes, or None if not relevant."""
    t = e["type"]
    payload = e.get("payload") or {}
    if t == "quiz_answer":
        return 1.0 if payload.get("correct") else 0.0
    if t == "flashcard_review":
        rating = payload.get("rating")  # caller can pass 0..1
        if isinstance(rating, (int, float)):
            return max(0.0, min(1.0, float(rating)))
        return 0.7  # default "I knew it"
    return None


def recompute_for_user(user_id: str) -> int:
    """Recompute every concept's mastery for this user. Returns rows upserted."""
    sb = get_supabase_admin()
    if sb is None:
        return 0

    # Pull the relevant events in chronological order.
    evt_res = (
        sb.table("learning_events")
        .select("type,payload,ts")
        .eq("user_id", user_id)
        .in_("type", ["quiz_answer", "flashcard_review"])
        .order("ts", desc=False)
        .limit(5000)
        .execute()
    )
    events = getattr(evt_res, "data", None) or []
    if not events:
        return 0

    # Resolve artifact_id → concept_id (single lookup table for this user's docs).
    art_ids = sorted({(e.get("payload") or {}).get("artifact_id") for e in events
                      if (e.get("payload") or {}).get("artifact_id")})
    if not art_ids:
        return 0
    art_res = (
        sb.table("artifacts")
        .select("id,concept_id,document_id")
        .in_("id", art_ids)
        .execute()
    )
    art_rows = getattr(art_res, "data", None) or []
    concept_by_artifact: dict[str, str | None] = {
        r["id"]: r.get("concept_id") for r in art_rows
    }
    doc_by_artifact: dict[str, str] = {r["id"]: r["document_id"] for r in art_rows}

    # For artifacts without concept_id, fall back to the document's first concept.
    docs_needing_fallback = sorted({
        doc_by_artifact[a] for a in concept_by_artifact
        if concept_by_artifact[a] is None and a in doc_by_artifact
    })
    fallback_concept: dict[str, str] = {}
    if docs_needing_fallback:
        c_res = (
            sb.table("concepts")
            .select("id,document_id")
            .in_("document_id", docs_needing_fallback)
            .execute()
        )
        for row in getattr(c_res, "data", None) or []:
            fallback_concept.setdefault(row["document_id"], row["id"])

    scores: dict[str, float] = {}
    for e in events:
        signal = _signal_for_event(e)
        if signal is None:
            continue
        payload = e.get("payload") or {}
        a_id = payload.get("artifact_id")
        if not a_id:
            continue
        concept_id = concept_by_artifact.get(a_id)
        if not concept_id:
            doc_id = doc_by_artifact.get(a_id)
            concept_id = fallback_concept.get(doc_id) if doc_id else None
        if not concept_id:
            continue
        prev = scores.get(concept_id, 0.5)
        scores[concept_id] = (1 - ALPHA) * prev + ALPHA * signal

    if not scores:
        return 0

    rows = [
        {"user_id": user_id, "concept_id": cid, "score": s}
        for cid, s in scores.items()
    ]
    # upsert by primary key (user_id, concept_id)
    sb.table("mastery").upsert(rows, on_conflict="user_id,concept_id").execute()
    return len(rows)
