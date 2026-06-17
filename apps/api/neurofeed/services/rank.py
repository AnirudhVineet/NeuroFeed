"""Feed ranking — explainable, weighted, not ML.

score = w_weak * weak_concept_boost
      + w_recency * recency_decay
      + w_subject * subject_match
      + w_variety * variety_bonus
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import exp
from typing import Any

W_WEAK = 1.0
W_RECENCY = 0.6
W_SUBJECT = 0.4
W_VARIETY = 0.2


def _recency_decay(created_at: str | None) -> float:
    if not created_at:
        return 0.0
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except Exception:
        return 0.0
    age_h = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0)
    # half-life ~24h
    return exp(-age_h / 24.0)


def rank_artifacts(
    artifacts: list[dict[str, Any]],
    *,
    mastery: dict[str, float],
    subjects: set[str] | None = None,
    served_concept_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    served_concept_ids = served_concept_ids or set()
    ranked: list[dict[str, Any]] = []
    seen_types: dict[str, int] = {}

    for a in artifacts:
        concept_id = a.get("concept_id") or ""
        m = mastery.get(concept_id, 0.0) if concept_id else 0.0
        weak = max(0.0, 1.0 - m) if concept_id else 0.0  # unknown ≈ weak

        recency = _recency_decay(a.get("created_at"))

        subject_hit = 0.0
        if subjects:
            doc_title = (a.get("document_title") or "").lower()
            if any(s.lower() in doc_title for s in subjects):
                subject_hit = 1.0

        # discourage too many of the same type back-to-back
        seen = seen_types.get(a["type"], 0)
        variety = max(0.0, 1.0 - seen * 0.15)

        # gentle penalty for re-serving the same concept this session
        if concept_id and concept_id in served_concept_ids:
            variety *= 0.5

        score = (
            W_WEAK * weak
            + W_RECENCY * recency
            + W_SUBJECT * subject_hit
            + W_VARIETY * variety
        )
        reason = {
            "weak": round(weak, 3),
            "recency": round(recency, 3),
            "subject": round(subject_hit, 3),
            "variety": round(variety, 3),
        }
        ranked.append({**a, "score": score, "reason": reason})
        seen_types[a["type"]] = seen + 1

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked
