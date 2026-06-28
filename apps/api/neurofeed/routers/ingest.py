"""Ingest API.

POST /api/ingest                       → register an upload (caller already uploaded to Storage)
GET  /api/ingest/{doc_id}/status       → SSE stream of status transitions
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..deps import get_supabase_admin
from ..services.parse import SourceType, detect_source_type
from ..workers import bus
from ..workers.jobs import schedule_generate_job, schedule_parse_job

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

Visibility = Literal["private", "friends", "public"]


class IngestRequest(BaseModel):
    user_id: str = Field(..., description="auth.users.id of the uploader")
    title: str
    storage_path: str = Field(..., description="'bucket/key' inside Supabase Storage")
    filename: str
    content_type: str | None = None
    source_type: SourceType | None = None
    visibility: Visibility = Field(
        "private",
        description="Who can see the document and its generated content. Defaults to private.",
    )


class IngestResponse(BaseModel):
    document_id: str
    status: str


@router.post("", response_model=IngestResponse)
async def ingest(req: IngestRequest) -> IngestResponse:
    src = req.source_type or detect_source_type(req.filename, req.content_type)

    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")

    inserted = (
        sb.table("documents")
        .insert(
            {
                "user_id": req.user_id,
                "title": req.title,
                "source_type": src,
                "storage_path": req.storage_path,
                "status": "uploaded",
                "visibility": req.visibility,
            }
        )
        .execute()
    )
    rows = getattr(inserted, "data", None) or []
    if not rows:
        raise HTTPException(500, "failed to create document row")
    doc_id = rows[0]["id"]

    schedule_parse_job(
        doc_id=doc_id,
        source_type=src,
        storage_path=req.storage_path,
        filename=req.filename,
    )
    return IngestResponse(document_id=doc_id, status="uploaded")


@router.post("/{doc_id}/regenerate", response_model=IngestResponse)
async def regenerate(doc_id: str) -> IngestResponse:
    """Re-run artifact generation for a doc that already parsed + chunked.

    Used when the first generate_job failed (e.g. provider rate limit) and we
    want to retry without re-uploading the file.
    """
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(503, "Supabase not configured")
    res = sb.table("documents").select("id").eq("id", doc_id).single().execute()
    if not getattr(res, "data", None):
        raise HTTPException(404, f"document {doc_id} not found")
    schedule_generate_job(doc_id=doc_id)
    return IngestResponse(document_id=doc_id, status="generating")


@router.get("/{doc_id}/status")
async def status_stream(doc_id: str, request: Request) -> StreamingResponse:
    async def gen() -> AsyncIterator[bytes]:
        # Send a snapshot first (so reconnects/late subscribers get something).
        sb = get_supabase_admin()
        if sb is not None:
            try:
                res = sb.table("documents").select("status,error").eq("id", doc_id).single().execute()
                snapshot = getattr(res, "data", None) or {}
                if snapshot:
                    yield _sse_event({"status": snapshot.get("status"), "error": snapshot.get("error")})
            except Exception:
                pass

        q = await bus.subscribe(doc_id)
        try:
            terminal = {"ready", "error"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    # heartbeat to keep proxies happy
                    yield b": ping\n\n"
                    continue
                yield _sse_event(evt)
                if evt.get("status") in terminal:
                    break
        finally:
            await bus.unsubscribe(doc_id, q)

    return StreamingResponse(gen(), media_type="text/event-stream")


def _sse_event(data: dict) -> bytes:
    return f"data: {json.dumps(data)}\n\n".encode("utf-8")
