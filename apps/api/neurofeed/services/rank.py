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
W_INTEREST = 0.8  # interest signals carry weight close to weak-concept boost

INTEREST_HARD_HIDE = -2.0  # net signal at-or-below this hides the artifact
INTEREST_CLAMP = 3.0  # bound aggregated signed counts so a single doc can't dominate

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
    doc_interest: dict[str, float],
    concept_interest: dict[str, float],
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

    # Interest signal: per-document and per-concept signals are summed.
    # +1 per "interested" event, -1 per "not_interested". Clamped to avoid
    # one heavily-interacted item dominating the whole feed.
    doc_id = a.get("document_id") or ""
    sig = 0.0
    if doc_id:
        sig += max(-INTEREST_CLAMP, min(INTEREST_CLAMP, doc_interest.get(doc_id, 0.0)))
    if concept_id:
        sig += max(-INTEREST_CLAMP, min(INTEREST_CLAMP, concept_interest.get(concept_id, 0.0)))
    # Normalise to roughly [-1, 1] before weighting.
    interest = max(-1.0, min(1.0, sig / (INTEREST_CLAMP * 2)))

    score = (
        W_WEAK * weak
        + W_RECENCY * recency
        + W_SUBJECT * subject_hit
        + W_VARIETY * variety
        + W_INTEREST * interest
    )
    return score, {
        "weak": round(weak, 3),
        "recency": round(recency, 3),
        "subject": round(subject_hit, 3),
        "variety": round(variety, 3),
        "interest": round(interest, 3),
    }


def rank_artifacts(
    artifacts: list[dict[str, Any]],
    *,
    mastery: dict[str, float],
    subjects: set[str] | None = None,
    served_concept_ids: set[str] | None = None,
    limit: int | None = None,
    doc_interest: dict[str, float] | None = None,
    concept_interest: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    served_concept_ids = set(served_concept_ids or set())
    doc_interest = doc_interest or {}
    concept_interest = concept_interest or {}

    base: list[dict[str, Any]] = []
    seen_types: dict[str, int] = {}
    for a in artifacts:
        # Hard-hide items the user has strongly dismissed (doc-level).
        doc_id = a.get("document_id") or ""
        if doc_id and doc_interest.get(doc_id, 0.0) <= INTEREST_HARD_HIDE:
            continue
        s, reason = _score(
            a,
            mastery=mastery,
            subjects=subjects,
            served_concept_ids=served_concept_ids,
            seen_types=seen_types,
            doc_interest=doc_interest,
            concept_interest=concept_interest,
        )
        base.append({**a, "score": s, "reason": reason})
        seen_types[a["type"]] = seen_types.get(a["type"], 0) + 1
    base.sort(key=lambda x: x["score"], reverse=True)

    # Collapse multi-part reels (same doc + concept + topic, part_total > 1)
    # into a single representative carrying its siblings in part-order. The
    # representative keeps the BEST score in the group so it lands where any
    # part would have ranked; the slot-filler below expands it back inline.
    base = _group_reel_parts(base)

    if limit is None or limit <= 0:
        return _expand_groups(base)

    # Split: a fresh queue + a revision queue (low-mastery only).
    fresh = [x for x in base if not _is_weak(x, mastery)]
    weak = [x for x in base if _is_weak(x, mastery)]

    target_weak_slots = max(1, int(round(limit * REVISION_FRACTION))) if weak else 0
    out: list[dict[str, Any]] = []
    f_i = w_i = 0
    weak_stride = max(2, int(round(1.0 / REVISION_FRACTION))) if target_weak_slots else 0
    used_weak = 0
    slot = 0
    # Each entry from base/fresh/weak may be a single artifact OR a grouped
    # multi-part reel; expanding the latter can yield 2-3 items per slot. We
    # let a group overshoot `limit` slightly rather than truncate it mid-
    # sequence — losing part 3 of 3 is worse than serving 31 items instead of 30.
    while len(out) < limit:
        want_weak = weak_stride > 0 and (slot + 1) % weak_stride == 0 and used_weak < target_weak_slots
        if want_weak and w_i < len(weak):
            x = dict(weak[w_i]); w_i += 1
            x["reason"] = {**x.get("reason", {}), "revision": 1}
            _emit(out, x)
            used_weak += 1
        elif f_i < len(fresh):
            _emit(out, fresh[f_i]); f_i += 1
        elif w_i < len(weak):
            x = dict(weak[w_i]); w_i += 1
            x["reason"] = {**x.get("reason", {}), "revision": 1}
            _emit(out, x)
        else:
            break
        slot += 1
    return out


def _is_weak(a: dict[str, Any], mastery: dict[str, float]) -> bool:
    cid = a.get("concept_id") or ""
    if not cid:
        return False
    return mastery.get(cid, 1.0) < WEAK_MASTERY_FLOOR


# Internal key used to mark a grouped multi-part reel. The group carries its
# member artifacts in `_parts` (already sorted by part_index) and presents the
# best-scoring member's score so it ranks where any part would have ranked.
_GROUP_KEY = "_parts"


def _group_reel_parts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse multi-part reels into single group representatives.

    Two items are siblings when they share (document_id, concept_id, topic)
    AND both declare part_total > 1. The representative keeps the highest
    score in the group; siblings are stashed under `_GROUP_KEY` in part order.
    Items without parts pass through unchanged.
    """
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    order: list[tuple[str, str, str] | dict[str, Any]] = []
    for it in items:
        key = _reel_group_key(it)
        if key is None:
            order.append(it)
            continue
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(it)

    out: list[dict[str, Any]] = []
    for entry in order:
        if isinstance(entry, dict):
            out.append(entry)
            continue
        members = sorted(groups[entry], key=_part_sort_key)
        best = max(members, key=lambda m: m.get("score", 0.0))
        rep = dict(best)
        rep[_GROUP_KEY] = members
        out.append(rep)
    # Re-sort so group representatives sit at their best member's rank.
    out.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return out


def _reel_group_key(a: dict[str, Any]) -> tuple[str, str, str] | None:
    if a.get("type") != "reel_script":
        return None
    payload = a.get("payload") or {}
    part_total = payload.get("part_total")
    if not isinstance(part_total, int) or part_total <= 1:
        return None
    topic = (payload.get("topic") or "").strip().lower()
    doc_id = a.get("document_id") or ""
    concept_id = a.get("concept_id") or ""
    if not topic and not concept_id:
        return None
    return (doc_id, concept_id, topic)


def _part_sort_key(a: dict[str, Any]) -> tuple[int, str]:
    payload = a.get("payload") or {}
    idx = payload.get("part_index")
    # Items missing part_index sort last; created_at breaks remaining ties.
    return (idx if isinstance(idx, int) else 999, a.get("created_at") or "")


def _expand_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for it in items:
        _emit(out, it)
    return out


def _emit(out: list[dict[str, Any]], it: dict[str, Any]) -> None:
    """Append a single artifact or expand a grouped multi-part reel inline."""
    parts = it.get(_GROUP_KEY)
    if not parts:
        out.append(it)
        return
    revision = bool((it.get("reason") or {}).get("revision"))
    for p in parts:
        member = dict(p)
        member.pop(_GROUP_KEY, None)
        if revision:
            member["reason"] = {**member.get("reason", {}), "revision": 1}
        out.append(member)
