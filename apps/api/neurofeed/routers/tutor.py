"""AI Tutor (Groq + RAG)."""
from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_supabase_admin
from ..services.llm.json_gen import generate_json
from ..services.llm.router import fallback_client, route_client
from ..services.rag import CONFIDENCE_FLOOR, retrieve

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

TutorLevel = Literal["beg", "int", "adv"]

_LEVEL_INSTRUCTION = {
    "beg": "Explain like the reader is a complete beginner. Plain language. Short sentences.",
    "int": "Explain at an intermediate level. Some technical vocabulary is fine if defined.",
    "adv": "Be precise and dense. Assume domain familiarity.",
}


class TutorIn(BaseModel):
    user_id: str
    question: str = Field(..., max_length=2000)
    level: TutorLevel = "int"
    document_id: str | None = None


class CitationOut(BaseModel):
    doc_id: str
    page_or_slide: int | None
    chunk_id: int


class TutorOut(BaseModel):
    answer: str
    level: TutorLevel
    citations: list[CitationOut]
    confidence: float
    grounded: bool


@router.post("", response_model=TutorOut)
async def tutor(req: TutorIn) -> TutorOut:
    chunks, max_sim = await asyncio.to_thread(
        retrieve, user_id=req.user_id, question=req.question, top_k=5, document_id=req.document_id,
    )

    if not chunks or max_sim < CONFIDENCE_FLOOR:
        try:
            sb = get_supabase_admin()
            if sb is not None:
                sb.table("learning_events").insert({
                    "user_id": req.user_id, "type": "tutor_query",
                    "payload": {"question": req.question, "grounded": False, "confidence": max_sim},
                }).execute()
        except Exception:
            pass
        return TutorOut(
            answer=(
                "This isn't in your uploaded material. Upload a document covering this "
                "topic and I'll be able to answer from it."
            ),
            level=req.level,
            citations=[],
            confidence=max_sim,
            grounded=False,
        )

    chunk_block = "\n\n".join(
        f"[chunk {c.chunk_id}{_ref_str(c.page_ref)}]\n{c.text}" for c in chunks
    )

    system = (
        "You are a study tutor grounded in the user's own material. Answer ONLY from the "
        "chunks provided. If the chunks do not contain the answer, say so. Cite the chunks "
        "you actually used by id.\n"
        f"Level: {_LEVEL_INSTRUCTION[req.level]}\n"
        'Schema: {"answer": str, "level": "beg"|"int"|"adv", '
        '"citations": [{"doc_id": str, "page_or_slide": int|null, "chunk_id": int}], '
        '"confidence": number between 0 and 1}'
    )
    user = f"Question: {req.question}\n\nMaterial:\n{chunk_block}"

    client, provider = route_client(human_waiting=True)
    if client is None:
        raise HTTPException(503, "no LLM provider configured")

    try:
        data = await generate_json(
            client=client, system=system, user=user, provider=provider, max_tokens=900,
        )
    except Exception:
        client2, provider2 = fallback_client(provider)
        if client2 is None:
            raise
        data = await generate_json(
            client=client2, system=system, user=user, provider=provider2, max_tokens=900,
        )

    citations_raw = data.get("citations") or []
    citations: list[CitationOut] = []
    chunk_by_id = {c.chunk_id: c for c in chunks}
    for cit in citations_raw:
        cid = cit.get("chunk_id")
        if not isinstance(cid, int) or cid not in chunk_by_id:
            continue
        c = chunk_by_id[cid]
        page_or_slide = cit.get("page_or_slide")
        if not isinstance(page_or_slide, int):
            page_or_slide = c.page_ref.get("page") or c.page_ref.get("slide")
        citations.append(
            CitationOut(
                doc_id=c.document_id, page_or_slide=page_or_slide, chunk_id=c.chunk_id,
            )
        )

    answer = str(data.get("answer", "")).strip()
    confidence = float(data.get("confidence", max_sim))

    try:
        sb = get_supabase_admin()
        if sb is not None:
            sb.table("learning_events").insert({
                "user_id": req.user_id, "type": "tutor_query",
                "payload": {
                    "question": req.question, "grounded": True,
                    "confidence": confidence, "citations": [c.model_dump() for c in citations],
                },
            }).execute()
    except Exception:
        pass

    return TutorOut(
        answer=answer or "I couldn't form a grounded answer from your material.",
        level=req.level,
        citations=citations,
        confidence=confidence,
        grounded=True,
    )


def _ref_str(ref: dict) -> str:
    if "page" in ref:
        return f" p.{ref['page']}"
    if "slide" in ref:
        return f" slide {ref['slide']}"
    if "segment" in ref:
        return f" seg {ref['segment']}"
    return ""
