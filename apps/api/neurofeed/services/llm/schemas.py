"""Pydantic schemas for every artifact returned by an LLM.

Mirror these in packages/shared-types for the frontend.
Every LLM generation MUST return strict JSON matching the model declared in its
system prompt.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, conint, conlist


# ---------- Summary ----------
class Summary(BaseModel):
    tldr: str = Field(..., max_length=400)
    bullets: conlist(str, min_length=5, max_length=8)  # type: ignore[valid-type]


# ---------- Key concept ----------
class KeyConcept(BaseModel):
    name: str = Field(..., max_length=80)
    definition: str = Field(..., max_length=400)
    why_it_matters: str = Field(..., max_length=300)
    source_chunk_ids: list[int] = Field(default_factory=list)


class KeyConceptList(BaseModel):
    concepts: conlist(KeyConcept, min_length=5, max_length=15)  # type: ignore[valid-type]


# ---------- Swipe card ----------
class SwipeCard(BaseModel):
    title: str = Field(..., max_length=60)
    body: str = Field(..., max_length=240, description="<=40 words")
    icon: str = Field(..., max_length=24, description="emoji or lucide name")
    accent_color: str = Field(..., pattern=r"^#[0-9a-fA-F]{6}$")
    concept_id: str | None = None


class SwipeCardSet(BaseModel):
    cards: conlist(SwipeCard, min_length=8, max_length=14)  # type: ignore[valid-type]


# ---------- Flashcard ----------
Difficulty = conint(ge=1, le=3)  # type: ignore[valid-type]


class Flashcard(BaseModel):
    question: str = Field(..., max_length=240)
    answer: str = Field(..., max_length=400)
    concept_id: str | None = None
    difficulty: Difficulty


class FlashcardSet(BaseModel):
    cards: conlist(Flashcard, min_length=10, max_length=20)  # type: ignore[valid-type]


# ---------- Quiz ----------
class QuizItem(BaseModel):
    stem: str = Field(..., max_length=300)
    options: conlist(str, min_length=4, max_length=4)  # type: ignore[valid-type]
    answer_index: conint(ge=0, le=3)  # type: ignore[valid-type]
    explanation: str = Field(..., max_length=240)
    source_chunk_id: int | None = None


class QuizSet(BaseModel):
    items: conlist(QuizItem, min_length=8, max_length=12)  # type: ignore[valid-type]


# ---------- Learning path ----------
class LearningPathStep(BaseModel):
    order: conint(ge=1)  # type: ignore[valid-type]
    concept_id: str
    goal: str = Field(..., max_length=200)
    artifact_ids: list[str] = Field(default_factory=list)


class LearningPath(BaseModel):
    steps: conlist(LearningPathStep, min_length=3, max_length=15)  # type: ignore[valid-type]


# ---------- Reel script ----------
class ReelScene(BaseModel):
    caption: str = Field(..., max_length=120)
    voiceover: str = Field(..., max_length=240)
    visual_hint: str = Field(..., max_length=120)
    duration_sec: float = Field(..., gt=0.5, le=8.0)


class ReelScript(BaseModel):
    scenes: conlist(ReelScene, min_length=3, max_length=8)  # type: ignore[valid-type]


# ---------- Tutor ----------
TutorLevel = Literal["beg", "int", "adv"]


class TutorCitation(BaseModel):
    doc_id: str
    page_or_slide: int | None = None
    chunk_id: int


class TutorAnswer(BaseModel):
    answer: str
    level: TutorLevel
    citations: list[TutorCitation] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
