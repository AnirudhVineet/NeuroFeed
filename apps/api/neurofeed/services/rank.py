"""Feed ranking — explainable, weighted, not ML.

score = w_weak * weak_concept_boost
      + w_recency * recency_decay
      + w_subject * subject_match
      + w_variety * variety_bonus

After base ranking, ~`REVISION_FRACTION` of the returned slots are reserved for
low-mastery artifacts (revision injection), marked with reason.revision=true.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import exp
from typing import Any

W_WEAK = 1.0
W_RECENCY = 0.6
W_SUBJECT = 0.4
W_VARIETY = 0.2

REVISION_FRACTION = 0.2  # ~20% of returned items target weak concepts
WEAK_MASTERY_FLOOR = 0.4  # mastery score below this counts as "weak"


def _recency_decay(created_at: str | None) -> float:
    if not created_at:
        return 0.0
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except Exception:
        return 0.0
    age_h = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0)
    return exp(-age_h / 24.0)


def _score(
    a: dict[str, Any],
    *,
    mastery: dict[str, float],
    subjects: set[str] | None,
    served_concept_ids: set[str],
    seen_types: dict[str, int],
) -> tuple[float, dict[str, float]]:
    concept_id = a.get("concept_id") or ""
    m = mastery.get(concept_id, 0.0) if concept_id else 0.0
    weak = max(0.0, 1.0 - m) if concept_id else 0.0

    recency = _recency_decay(a.get("created_at"))

    subject_hit = 0.0
    if subjects:
        doc_title = (a.get("document_title") or "").lower()
        if any(s.lower() in doc_title for s in subjects):
            subject_hit = 1.0

    seen = seen_types.get(a["type"], 0)
    variety = max(0.0, 1.0 - seen * 0.15)
    if concept_id and concept_id in served_concept_ids:
        variety *= 0.5

    score = (
        W_WEAK * weak
        + W_RECENCY * recency
        + W_SUBJECT * subject_hit
        + W_VARIETY * variety
    )
    return score, {
        "weak": round(weak, 3),
        "recency": round(recency, 3),
        "subject": round(subject_hit, 3),
        "variety": round(variety, 3),
    }


def rank_artifacts(
    artifacts: list[dict[str, Any]],
    *,
    mastery: dict[str, float],
    subjects: set[str] | None = None,
    served_concept_ids: set[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    served_concept_ids = set(served_concept_ids or set())

    base: list[dict[str, Any]] = []
    seen_types: dict[str, int] = {}
    for a in artifacts:
        s, reason = _score(
            a,
            mastery=mastery,
            subjects=subjects,
            served_concept_ids=served_concept_ids,
            seen_types=seen_types,
        )
        base.append({**a, "score": s, "reason": reason})
        seen_types[a["type"]] = seen_types.get(a["type"], 0) + 1
    base.sort(key=lambda x: x["score"], reverse=True)

    if limit is None or limit <= 0:
        return base

    # Split: a fresh queue + a revision queue (low-mastery only).
    fresh = [x for x in base if not _is_weak(x, mastery)]
    weak = [x for x in base if _is_weak(x, mastery)]

    target_weak_slots = max(1, int(round(limit * REVISION_FRACTION))) if weak else 0
    out: list[dict[str, Any]] = []
    f_i = w_i = 0
    weak_stride = max(2, int(round(1.0 / REVISION_FRACTION))) if target_weak_slots else 0
    used_weak = 0
    for slot in range(limit):
        want_weak = weak_stride > 0 and (slot + 1) % weak_stride == 0 and used_weak < target_weak_slots
        if want_weak and w_i < len(weak):
            x = dict(weak[w_i]); w_i += 1
            x["reason"] = {**x.get("reason", {}), "revision": 1}
            out.append(x)
            used_weak += 1
        elif f_i < len(fresh):
            out.append(fresh[f_i]); f_i += 1
        elif w_i < len(weak):
            x = dict(weak[w_i]); w_i += 1
            x["reason"] = {**x.get("reason", {}), "revision": 1}
            out.append(x)
        else:
            break
    return out


def _is_weak(a: dict[str, Any], mastery: dict[str, float]) -> bool:
    cid = a.get("concept_id") or ""
    if not cid:
        return False
    return mastery.get(cid, 1.0) < WEAK_MASTERY_FLOOR
