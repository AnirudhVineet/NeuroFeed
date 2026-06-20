"""Pydantic schemas for every artifact returned by an LLM.

Mirror these in packages/shared-types for the frontend.
Every LLM generation MUST return strict JSON matching the model declared in its
system prompt.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, conint, conlist


# ---------- Summary ----------
class Summary(BaseModel):
    tldr: str = Field(..., max_length=800)
    bullets: conlist(str, min_length=3, max_length=12)  # type: ignore[valid-type]


# ---------- Key concept ----------
class KeyConcept(BaseModel):
    name: str = Field(..., max_length=80)
    definition: str = Field(..., max_length=400)
    why_it_matters: str = Field(..., max_length=300)
    source_chunk_ids: list[int] = Field(default_factory=list)


class KeyConceptList(BaseModel):
    concepts: conlist(KeyConcept, min_length=5, max_length=60)  # type: ignore[valid-type]


# ---------- Swipe card ----------
class SwipeCard(BaseModel):
    title: str = Field(..., max_length=120)
    body: str = Field(..., max_length=400, description="<=60 words")
    icon: str = Field(default="✨", max_length=24, description="emoji or lucide name")
    # Loosened: LLMs produce all kinds of garbage here — "#FFF", "blue",
    # full UUIDs with a "#" prefix, etc. We accept anything; the frontend
    # falls back to its own palette when the value isn't a real CSS color.
    accent_color: str = Field(default="#8B5CF6")
    concept_id: str | None = None


class SwipeCardSet(BaseModel):
    cards: conlist(SwipeCard, min_length=4, max_length=20)  # type: ignore[valid-type]


# ---------- Flashcard ----------
Difficulty = conint(ge=1, le=3)  # type: ignore[valid-type]


class Flashcard(BaseModel):
    question: str = Field(..., max_length=400)
    answer: str = Field(..., max_length=600)
    concept_id: str | None = None
    difficulty: Difficulty = 2  # type: ignore[assignment]


class FlashcardSet(BaseModel):
    cards: conlist(Flashcard, min_length=5, max_length=30)  # type: ignore[valid-type]


# ---------- Quiz ----------
class QuizItem(BaseModel):
    stem: str = Field(..., max_length=500)
    options: conlist(str, min_length=2, max_length=6)  # type: ignore[valid-type]
    answer_index: conint(ge=0, le=5)  # type: ignore[valid-type]
    explanation: str = Field(default="", max_length=500)
    source_chunk_id: int | None = None


class QuizSet(BaseModel):
    items: conlist(QuizItem, min_length=3, max_length=20)  # type: ignore[valid-type]


# ---------- Learning path ----------
class LearningPathStep(BaseModel):
    order: conint(ge=1)  # type: ignore[valid-type]
    concept_id: str = ""
    goal: str = Field(..., max_length=400)
    artifact_ids: list[str] = Field(default_factory=list)


class LearningPath(BaseModel):
    steps: conlist(LearningPathStep, min_length=2, max_length=20)  # type: ignore[valid-type]


# ---------- Reel script ----------
SceneType = Literal[
    "hook", "problem", "concept", "visualization", "example",
    "analogy", "fun_fact", "summary", "application", "comparison",
]
AnimationType = Literal[
    "zoom_in", "zoom_out", "slide_left", "slide_right", "slide_up",
    "fade", "scale_up", "kinetic_text", "type_writer", "highlight",
    "split", "pulse",
]
TransitionType = Literal["fade", "slide", "zoom", "wipe", "morph"]
VisualKind = Literal[
    # legacy decorative kinds — kept for back-compat, but the prompt no longer
    # suggests them; the frontend degrades them into educational fallbacks.
    "arrow_flow", "icon_grid", "comparison", "timeline", "diagram",
    "bar_chart", "particles", "concept_map", "gradient_pulse", "shape_morph",
    # new educational visuals — each one TEACHES, it does not just decorate.
    "network_packets",       # packets traveling over a wired network
    "neural_network",        # input/hidden/output layers + animated activations
    "tree_traversal",        # binary tree with highlighted traversal
    "sorting_bars",          # bars rearranging into sorted order
    "linked_list",           # nodes connected with next pointers
    "stack_queue",           # push/pop or enqueue/dequeue ops
    "equation",              # rendered formula(s)
    "coordinate_graph",      # x/y axes with a function curve
    "flowchart",             # ordered process steps with arrows
    "molecule",              # atoms + bonds
    "waveform",              # sine / square wave / pulse train
    "supply_demand",         # crossing economic curves
    "map_route",             # simple map with a highlighted path
    "process_diagram",       # block diagram of a process / pipeline
]
MusicMood = Literal["uplifting", "curious", "intense", "dreamy", "playful"]


class ReelScene(BaseModel):
    # All Literal types loosened to plain strings: LLMs frequently pick
    # variants like "key_concept" or "visualize" that aren't in the enum.
    # The frontend's `normaliseReel` defaults anything unknown sensibly.
    scene_type: str = Field(default="concept", max_length=40)
    narration: str = Field(..., min_length=10, max_length=1200)
    subtitle: str = Field(..., min_length=1, max_length=160)
    image_prompt: str = Field(default="", max_length=400)
    animation_type: str = Field(default="fade", max_length=40)
    transition_type: str = Field(default="fade", max_length=40)
    highlight_words: list[str] = Field(default_factory=list)
    duration_sec: float = Field(default=6.0, ge=1.0, le=30.0)
    visual_kind: str = Field(default="flowchart", max_length=40)
    # Optional structured payload the visual renderer uses to draw the scene
    # accurately (chart points, network nodes, equation TeX, etc.). Schema is
    # intentionally open — see VISUAL_SPEC.md in the frontend for shapes.
    visual_spec: dict[str, Any] | None = None


class ReelScript(BaseModel):
    topic: str = Field(..., max_length=240)
    title: str = Field(default="", max_length=240)
    hook: str = Field(default="", max_length=600)
    music_mood: str = Field(default="curious", max_length=40)
    scenes: conlist(ReelScene, min_length=2, max_length=15)  # type: ignore[valid-type]


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
