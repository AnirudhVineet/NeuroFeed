"""Per-artifact generators (Featherless, batched, JSON-strict).

Each generator:
  1. Builds a system prompt that declares the JSON schema inline.
  2. Builds a user prompt with the relevant chunk excerpts.
  3. Calls generate_json (single retry on parse failure).
  4. Validates with pydantic and returns the model.

The Featherless client wraps every call in a 4-wide semaphore — fan-out is safe.
"""
from __future__ import annotations

import logging
from typing import Any

from .llm.featherless import featherless_client
from .llm.json_gen import generate_json
from .llm.schemas import (
    FlashcardSet,
    KeyConceptList,
    LearningPath,
    QuizSet,
    ReelScript,
    Summary,
    SwipeCardSet,
)

log = logging.getLogger(__name__)


# ---------- Caps (build prompt §3) ----------
CAPS = {
    "key_concepts": (5, 15),
    "swipe_cards": (8, 14),
    "flashcards": (10, 20),
    "quiz": (8, 12),
    "learning_path": (3, 15),
    "reel_scripts": 3,           # number of reel scripts per doc
    "reel_scenes_per_script": (3, 8),
}


# ---------- Helpers ----------
def _client():
    c = featherless_client()
    if c is None:
        raise RuntimeError("FEATHERLESS_API_KEY not configured")
    return c


def _context(chunks: list[dict[str, Any]], max_chunks: int = 30, max_chars: int = 12000) -> str:
    """Concatenate chunk excerpts, bounded so we don't overflow a 70B-class context window."""
    out: list[str] = []
    total = 0
    for c in chunks[:max_chunks]:
        ref = c.get("page_ref") or {}
        ref_str = (
            f"p.{ref.get('page')}" if "page" in ref
            else f"slide {ref.get('slide')}" if "slide" in ref
            else f"seg {ref.get('segment')}" if "segment" in ref
            else ""
        )
        header = f"[chunk {c['id']}{(' ' + ref_str) if ref_str else ''}]"
        body = c["text"]
        piece = f"{header}\n{body}\n"
        if total + len(piece) > max_chars:
            break
        out.append(piece)
        total += len(piece)
    return "\n".join(out)


# ---------- Summary ----------
async def gen_summary(chunks: list[dict[str, Any]]) -> Summary:
    sys = (
        "You are a study assistant. Produce a tight summary of the provided material.\n"
        'Schema: {"tldr": "<=400 chars", "bullets": ["5 to 8 concise bullets"]}'
    )
    user = "Summarize this material.\n\n" + _context(chunks)
    data = await generate_json(client=_client(), system=sys, user=user, provider="featherless")
    return Summary.model_validate(data)


# ---------- Key concepts ----------
async def gen_key_concepts(chunks: list[dict[str, Any]]) -> KeyConceptList:
    lo, hi = CAPS["key_concepts"]
    sys = (
        f"Extract {lo}-{hi} key concepts from the material. Each concept needs a short name, "
        "a clear definition, why it matters, and a list of source chunk ids that support it.\n"
        'Schema: {"concepts": [{"name": str, "definition": str, "why_it_matters": str, '
        '"source_chunk_ids": [int]}]}'
    )
    user = (
        "Identify the most important concepts. Use only the material below; "
        "cite chunk ids from the headers.\n\n" + _context(chunks)
    )
    data = await generate_json(client=_client(), system=sys, user=user, provider="featherless")
    return KeyConceptList.model_validate(data)


# ---------- Swipe cards ----------
async def gen_swipe_cards(
    chunks: list[dict[str, Any]],
    concepts: list[dict[str, Any]],
) -> SwipeCardSet:
    lo, hi = CAPS["swipe_cards"]
    concept_lines = "\n".join(f"- {c['id']}: {c['name']}" for c in concepts[:20])
    sys = (
        f"Create {lo}-{hi} swipeable feed cards. One idea per card, body <=40 words. "
        "Each card has an emoji icon and a hex accent color.\n"
        'Schema: {"cards": [{"title": str, "body": str, "icon": str, '
        '"accent_color": "#RRGGBB", "concept_id": str|null}]}'
    )
    user = (
        "Concepts available (id: name):\n"
        f"{concept_lines}\n\n"
        "Material excerpts:\n"
        + _context(chunks)
    )
    data = await generate_json(
        client=_client(), system=sys, user=user, provider="featherless", max_tokens=1600
    )
    return SwipeCardSet.model_validate(data)


# ---------- Flashcards ----------
async def gen_flashcards(
    chunks: list[dict[str, Any]],
    concepts: list[dict[str, Any]],
) -> FlashcardSet:
    lo, hi = CAPS["flashcards"]
    concept_lines = "\n".join(f"- {c['id']}: {c['name']}" for c in concepts[:20])
    sys = (
        f"Create {lo}-{hi} flashcards from the material. Difficulty: 1 easy, 2 medium, 3 hard. "
        "Tie each card to a concept id when possible.\n"
        'Schema: {"cards": [{"question": str, "answer": str, "concept_id": str|null, '
        '"difficulty": 1|2|3}]}'
    )
    user = (
        "Concepts:\n"
        f"{concept_lines}\n\n"
        "Material:\n"
        + _context(chunks)
    )
    data = await generate_json(
        client=_client(), system=sys, user=user, provider="featherless", max_tokens=2000
    )
    return FlashcardSet.model_validate(data)


# ---------- Quiz ----------
async def gen_quiz(chunks: list[dict[str, Any]]) -> QuizSet:
    lo, hi = CAPS["quiz"]
    sys = (
        f"Write {lo}-{hi} multiple-choice questions. 4 options each, exactly one correct, "
        "with a one-line explanation and the source chunk id.\n"
        'Schema: {"items": [{"stem": str, "options": [str, str, str, str], '
        '"answer_index": 0|1|2|3, "explanation": str, "source_chunk_id": int|null}]}'
    )
    user = "Material:\n" + _context(chunks)
    data = await generate_json(
        client=_client(), system=sys, user=user, provider="featherless", max_tokens=2000
    )
    return QuizSet.model_validate(data)


# ---------- Learning path ----------
async def gen_learning_path(concepts: list[dict[str, Any]]) -> LearningPath:
    lo, hi = CAPS["learning_path"]
    concept_lines = "\n".join(f"- {c['id']}: {c['name']}" for c in concepts[:25])
    sys = (
        f"Order the concepts into a learning path of {lo}-{hi} steps. Each step gets a one-line "
        "learning goal. Leave artifact_ids empty for now.\n"
        'Schema: {"steps": [{"order": int>=1, "concept_id": str, "goal": str, '
        '"artifact_ids": [str]}]}'
    )
    user = f"Concepts:\n{concept_lines}"
    data = await generate_json(client=_client(), system=sys, user=user, provider="featherless")
    return LearningPath.model_validate(data)


# ---------- Reel script ----------
async def gen_reel_script(focus_concept: dict[str, Any], chunks: list[dict[str, Any]]) -> ReelScript:
    lo, hi = CAPS["reel_scenes_per_script"]
    sys = (
        f"Write a vertical-video reel script of {lo}-{hi} scenes for the concept below. "
        "Each scene has a short caption, a voiceover line, a visual hint, and a duration "
        "(0.5-8 seconds).\n"
        'Schema: {"scenes": [{"caption": str, "voiceover": str, "visual_hint": str, '
        '"duration_sec": number}]}'
    )
    user = (
        f"Concept: {focus_concept['name']}\n"
        f"Definition: {focus_concept.get('definition') or focus_concept.get('summary') or ''}\n\n"
        "Source material excerpts:\n"
        + _context(chunks, max_chunks=8, max_chars=4000)
    )
    data = await generate_json(client=_client(), system=sys, user=user, provider="featherless")
    return ReelScript.model_validate(data)
