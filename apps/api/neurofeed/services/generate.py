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
    ReelScriptList,
    Summary,
    SwipeCardSet,
)

log = logging.getLogger(__name__)


# ---------- Caps (build prompt §3) ----------
CAPS = {
    "key_concepts": (5, 60),
    "swipe_cards": (8, 14),
    "flashcards": (10, 20),
    "quiz": (8, 12),
    "learning_path": (3, 15),
    "reel_scripts": 5,           # max concepts that get reels per doc
    "reels_per_concept": (1, 3), # how many reels the LLM may emit per concept
}


# ---------- Helpers ----------
def _client():
    c = featherless_client()
    if c is None:
        raise RuntimeError("FEATHERLESS_API_KEY not configured")
    return c


def _context(chunks: list[dict[str, Any]], max_chunks: int = 40, max_chars: int = 16000) -> str:
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
    total_chars = sum(len(c.get("text", "")) for c in chunks)
    # Adaptive: roughly one topic per ~1500 chars of source, clamped to [8, hi].
    target = max(8, min(hi, total_chars // 1500 or 8))
    sys = (
        f"Extract about {target} key concepts/topics from the material "
        f"(min {lo}, max {hi}). Cover the ENTIRE document — do not skip sections, "
        "intros, examples, or summaries. Each concept needs a short name, a clear "
        "definition, why it matters, and the source chunk ids that support it.\n"
        'Schema: {"concepts": [{"name": str, "definition": str, "why_it_matters": str, '
        '"source_chunk_ids": [int]}]}'
    )
    user = (
        "Identify every distinct topic worth its own teaching reel. Use only the "
        "material below; cite chunk ids from the headers.\n\n"
        + _context(chunks, max_chunks=50, max_chars=20000)
    )
    data = await generate_json(
        client=_client(), system=sys, user=user, provider="featherless", max_tokens=3500
    )
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
async def gen_reels_for_concept(
    focus_concept: dict[str, Any], chunks: list[dict[str, Any]],
) -> list[ReelScript]:
    """Return 1–3 single-topic reels for the concept.

    Each reel is self-contained: one focused narration (~20–35 s of TTS), one
    visual, one karaoke caption. If the concept is too dense to teach in a
    single reel, the LLM emits a sequence of parts (part_index/part_total) that
    appear adjacent to each other in the feed.
    """
    lo, hi = CAPS["reels_per_concept"]
    sys = (
        "You are a Kurzgesagt / Veritasium / 3Blue1Brown-style educational video "
        "writer. Your job is to TEACH the topic as a series of short vertical "
        "reels, not to summarise the source PDF. The source is ONLY a bank of "
        "facts; you are the teacher who turns those facts into a story.\n\n"
        "HARD RULES:\n"
        "- NEVER copy sentences or paragraphs from the source. Rewrite everything "
        "in your own conversational teaching voice.\n"
        "- ENRICH with intuition, analogies, vivid real-world examples, fun facts, "
        "historical context, and applications. The final reels must be MORE useful "
        "than the source paragraphs alone.\n"
        "- No textbook tone. No bullet-list dumps. No definitions without intuition. "
        "Sound like a passionate YouTube educator.\n"
        "- The VISUAL on every reel must TEACH something concrete about the topic. "
        "NEVER pick a generic decorative background (particles, gradient pulse, "
        "shape morph). Pick a visual_kind that draws the actual content — a packet "
        "moving over a network, a neural net firing, a tree being traversed, a "
        "graph being plotted, an equation being solved, a flowchart of the "
        "process, etc.\n\n"
        f"Produce {lo}-{hi} reels for this ONE topic.\n"
        "- Each reel covers ONE focused angle on the topic — never multiple "
        "unrelated ideas in the same reel.\n"
        "- Reel 1 opens with a HOOK: a question, surprising fact, or vivid "
        "scenario that makes the viewer want to keep watching.\n"
        "- DEFAULT TO ONE REEL. Only split when a single 50-130 word narration "
        "would clearly leave essential ideas unexplained. Use this heuristic:\n"
        "    1 reel — a single definition, a single mechanism, or a tight idea "
        "that fits in one ~25-second narration. (Most concepts land here.)\n"
        "    2 reels — the topic has TWO distinct halves that each deserve their "
        "own teaching beat (e.g. 'what it is' + 'how it works', or 'mechanism' + "
        "'consequence'), and forcing them into one reel would feel rushed.\n"
        "    3 reels — only for multi-stage processes or topics with several "
        "interlocking sub-ideas (e.g. an algorithm with setup → steps → analysis, "
        "or a phenomenon with cause → mechanism → real-world impact).\n"
        "- When splitting, give each part a distinct ANGLE — never just continue "
        "the same sentence from the previous part. If you cannot name a clear "
        "different angle per part, emit fewer reels instead.\n"
        "- For a single-part reel, leave part_index and part_total as null. For "
        "multi-part, set part_index (1-based) and part_total on EVERY reel in "
        "the sequence: part 1 hooks + sets up, middle parts develop, the last "
        "part lands the payoff.\n"
        "- Keep each reel watchable on its own. Do not require the viewer to "
        "have seen the previous part; recap the one essential prior idea in a "
        "single phrase if needed.\n\n"
        "Per-reel fields (ALL REQUIRED unless noted):\n"
        "- topic: the concept being taught (same string for every reel in a "
        "multi-part sequence).\n"
        "- title: a catchy hook-style title for THIS reel (e.g. 'Why doesn't the "
        "Internet melt?'). Different parts get different titles that reflect the "
        "angle of that part.\n"
        "- narration: 50-130 words, sounds great read aloud, conversational, no "
        "markdown, no lists. Aim for ~20-35 seconds of speech at 3 words/sec.\n"
        "- subtitle: 3-12 words. The punchy line that stays on screen. Title-case "
        "or sentence-case, no trailing punctuation.\n"
        "- highlight_words: 2-4 keywords drawn from the subtitle that should be "
        "visually emphasised.\n"
        "- duration_sec: 15-40 seconds, scaled to narration length (~3 words/sec).\n"
        "- animation_type: how the subtitle enters. Pick one that matches the "
        "reel's energy: [zoom_in, zoom_out, slide_left, slide_right, slide_up, "
        "fade, scale_up, kinetic_text, type_writer, highlight, split, pulse].\n"
        "- music_mood: one of [uplifting, curious, intense, dreamy, playful].\n"
        "- part_index / part_total: integers (1-based) for multi-part topics, or "
        "null for a single standalone reel.\n"
        "- visual_kind: MUST be one of the educational kinds. Pick the kind that "
        "literally draws the concept being taught:\n"
        "    network_packets   — packets travelling across routers/switches/hosts\n"
        "    neural_network    — input/hidden/output layers with activations\n"
        "    tree_traversal    — binary tree being walked in pre/in/post order\n"
        "    sorting_bars      — bars rearranging (bubble/merge/quick sort)\n"
        "    linked_list       — node[value] -> node[value] -> NULL\n"
        "    stack_queue       — push/pop or enqueue/dequeue operations\n"
        "    equation          — math formula(s) appearing / being solved\n"
        "    coordinate_graph  — x/y axes with a function curve plotted\n"
        "    flowchart         — ordered process boxes with arrows\n"
        "    process_diagram   — block diagram of a pipeline\n"
        "    molecule          — atoms + bonds (chemistry)\n"
        "    waveform          — sine/square/pulse wave (physics, signals)\n"
        "    supply_demand     — crossing economic curves\n"
        "    map_route         — geographic map with a highlighted path\n"
        "    timeline          — chronological events on an axis\n"
        "    comparison        — two-sided side-by-side comparison\n"
        "    bar_chart         — labeled bar chart with real values\n"
        "  DO NOT use: particles, gradient_pulse, shape_morph, icon_grid, "
        "concept_map, arrow_flow, diagram — these are decorative and forbidden.\n"
        "- visual_spec: REQUIRED OBJECT — the structured data the chosen visual "
        "needs to draw the reel. The shape depends on visual_kind:\n"
        "    network_packets   -> {nodes:[{id,label,kind?}], edges:[{from,to}], "
        "packets:[{from,to,label?}]}\n"
        "    neural_network    -> {layers:[3,5,4,2], layer_labels?:[..]}\n"
        "    tree_traversal    -> {values:[..nodes top-down level order..], "
        "traversal_order:[indices], operation:'inorder'|'preorder'|'postorder'|'bfs'}\n"
        "    sorting_bars      -> {initial:[..], sorted:[..], algorithm:'bubble'|..}\n"
        "    linked_list       -> {values:[..], operation?:'insert'|'delete'|null}\n"
        "    stack_queue       -> {values:[..], operation:'push'|'pop'|'enqueue'|'dequeue'}\n"
        "    equation          -> {latex:'E = mc^2', steps?:['...','...']}\n"
        "    coordinate_graph  -> {x_label,y_label,curves:[{label?,points:[[x,y],..]}]}\n"
        "    flowchart         -> {steps_labels:['Start','Step 1','Step 2','End']}\n"
        "    process_diagram   -> {nodes:[{id,label}], edges:[{from,to,label?}]}\n"
        "    molecule          -> {atoms:[{el:'C',x,y}], bonds:[{a,b,order?}]}\n"
        "    waveform          -> {wave:'sine'|'square'|'triangle'|'pulse', "
        "frequency?:1.0}\n"
        "    supply_demand     -> {equilibrium_label?:'P*'}\n"
        "    map_route         -> {route:[{x,y,label?},..]}\n"
        "    timeline          -> {steps_labels:['1950','1970',...]}\n"
        "    comparison        -> {nodes:[{id:'a',label:'Left side'},{id:'b',"
        "label:'Right side'}]}\n"
        "    bar_chart         -> {bars:[{label:'TCP',value:42},...]}\n"
        "  Fill visual_spec with REAL content that comes from the topic. "
        "Coordinates in coordinate_graph/molecule/map_route should be plain "
        "numbers in [0,100]. Keep arrays small (<=8 items) so it stays readable "
        "on a phone.\n\n"
        "- visual_beats: REQUIRED ARRAY of 2-6 timed visual shots that play in "
        "sequence under the SAME continuous narration. This is what makes the "
        "reel feel like a Kurzgesagt video instead of one static frame with "
        "voiceover.\n\n"
        "  HOW TO DECIDE BEAT COUNT — content-driven, NOT time-driven:\n"
        "    1. First, re-read your narration and mark every place the SUBJECT "
        "of the sentence changes (a new entity, a new step in a process, a new "
        "comparison, a new example, a hook → mechanism shift, etc.).\n"
        "    2. Emit ONE beat per distinct idea you marked. A narration that "
        "talks about 'a TCP packet', then 'the three-way handshake', then "
        "'what happens if it fails', then 'retransmission' is FOUR distinct "
        "ideas → four beats. A narration that explains a single mechanism "
        "without shifting subjects is TWO beats (entrance + payoff).\n"
        "    3. The visual MUST change every time the narration's subject "
        "changes. If the voiceover moves to a new entity but the visual stays "
        "the same, the reel feels like generic voiceover-over-stock-footage — "
        "the opposite of what we want.\n"
        "    4. Floor is 2 beats (single-beat reels should not use this field "
        "at all). Ceiling is 6 (prevents strobing on short reels).\n\n"
        "  HARD RULES for each beat:\n"
        "    * at_sec — the first beat MUST have at_sec=0. Subsequent values "
        "must be strictly increasing and stay inside duration_sec. Pick at_sec "
        "to match when the corresponding phrase is actually spoken — assume "
        "the voiceover runs at ~3 words per second from at_sec=0, so the "
        "phrase 'starting at word 18' lands around at_sec=6.\n"
        "    * caption_anchor — REQUIRED. Copy the 5-12-word phrase from the "
        "narration that this beat illustrates. This is the contract: the "
        "beat's visual_kind + visual_spec MUST visually depict the specific "
        "entities, numbers, and actions in caption_anchor.\n"
        "    * visual_kind / visual_spec — must literally draw what "
        "caption_anchor describes. Concrete relevance bar:\n"
        "        - If caption_anchor names entities ('TCP, UDP, ICMP'), the "
        "visual_spec MUST contain those exact labels (e.g. "
        "bars:[{label:'TCP',value:..},{label:'UDP',value:..},{label:'ICMP',value:..}]).\n"
        "        - If caption_anchor describes an action ('packet hops across "
        "three routers'), the visual_kind MUST be the one that shows that "
        "action (network_packets with three router nodes), NOT a related-"
        "but-generic kind like flowchart.\n"
        "        - If caption_anchor describes a relationship ('demand falls "
        "as price rises'), the visual_kind MUST be the one that shows the "
        "relationship (coordinate_graph or supply_demand), NOT a static list.\n"
        "        - A vaguely-on-topic visual is WORSE than no change. If you "
        "can't draw the specific phrase, REWRITE the phrase or fold this beat "
        "into the neighbour.\n"
        "    * No same visual_kind back-to-back. No re-using the same "
        "visual_spec values across two beats — each beat shows different "
        "entities or a different state.\n"
        "    * animation_type — each beat gets its own entrance animation "
        "from the same list as the reel-level animation_type.\n\n"
        "  The top-level visual_kind / visual_spec / animation_type fields are "
        "the FALLBACK rendering for legacy clients — set them to a copy of the "
        "first beat so old clients still render something coherent.\n\n"
        'Schema: {"reels": [{"topic": str, "title": str, "narration": str, '
        '"subtitle": str, "highlight_words": [str], "duration_sec": number, '
        '"visual_kind": str, "visual_spec": object, "animation_type": str, '
        '"music_mood": str, "visual_beats": [{"at_sec": number, "visual_kind": '
        'str, "visual_spec": object, "animation_type": str, "caption_anchor": '
        'str}], "part_index": int|null, "part_total": int|null}]}'
    )
    user = (
        f"TEACH this topic: {focus_concept['name']}\n"
        f"Definition (raw source): {focus_concept.get('definition') or focus_concept.get('summary') or ''}\n"
        f"Why it matters: {focus_concept.get('why_it_matters') or ''}\n\n"
        "Source facts (use as raw material — DO NOT copy sentences from these. "
        "Transform them into your own teaching voice and enrich with your own "
        "knowledge):\n"
        + _context(chunks, max_chunks=15, max_chars=9000)
    )
    data = await generate_json(
        client=_client(), system=sys, user=user, provider="featherless",
        max_tokens=6000, temperature=0.55,
    )
    return list(ReelScriptList.model_validate(data).reels)
