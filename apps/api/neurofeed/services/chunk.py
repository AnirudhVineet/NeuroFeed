"""Heading/slide-aware chunker. ~500-800 tokens per chunk, ~80 overlap.

Token count is estimated: tokens ≈ ceil(words * 1.3). This is good enough for sizing
without pulling in a tokenizer. Chunks never merge across distinct page_refs.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .parse import Block


@dataclass
class Chunk:
    ord: int
    text: str
    page_ref: dict
    heading: str | None


_TARGET_TOKENS = 650        # midpoint of 500-800
_MAX_TOKENS = 800
_OVERLAP_TOKENS = 80


def _est_tokens(s: str) -> int:
    words = len(s.split())
    return math.ceil(words * 1.3)


def _split_words(s: str) -> list[str]:
    return s.split()


def chunk(blocks: list[Block]) -> list[Chunk]:
    """Group consecutive blocks sharing a page_ref, then split into ~650-tok chunks."""
    if not blocks:
        return []

    groups: list[list[Block]] = []
    current: list[Block] = []
    current_ref: dict | None = None

    for b in blocks:
        if current_ref is None or b.page_ref == current_ref:
            current.append(b)
            current_ref = b.page_ref
        else:
            groups.append(current)
            current = [b]
            current_ref = b.page_ref
    if current:
        groups.append(current)

    chunks: list[Chunk] = []
    ord_i = 0
    for group in groups:
        # find first heading in the group, if any
        heading = next((b.heading for b in group if b.heading), None)
        page_ref = group[0].page_ref
        # flatten to a word stream
        text = "\n".join(b.text for b in group).strip()
        words = _split_words(text)
        if not words:
            continue

        # how many words ≈ target tokens?
        target_words = max(1, int(_TARGET_TOKENS / 1.3))
        max_words = max(target_words, int(_MAX_TOKENS / 1.3))
        overlap_words = max(0, int(_OVERLAP_TOKENS / 1.3))

        i = 0
        while i < len(words):
            j = min(len(words), i + target_words)
            # extend up to max_words to avoid splitting mid-sentence; cheap heuristic:
            # try to land on a token ending with terminal punctuation if within +max-target
            extend_cap = min(len(words), i + max_words)
            best_j = j
            for k in range(j, extend_cap):
                if words[k - 1].endswith((".", "?", "!", ";")):
                    best_j = k
                    break
            j = best_j

            slice_text = " ".join(words[i:j])
            chunks.append(Chunk(ord=ord_i, text=slice_text, page_ref=page_ref, heading=heading))
            ord_i += 1

            if j >= len(words):
                break
            i = max(j - overlap_words, i + 1)

    return chunks
