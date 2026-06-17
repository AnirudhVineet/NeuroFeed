from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.llm.json_gen import generate_json
from ..services.llm.router import route_client

router = APIRouter(prefix="/api/llm", tags=["llm"])


class EchoRequest(BaseModel):
    prompt: str = "Say hello."
    human_waiting: bool = True


class EchoResponse(BaseModel):
    provider: Literal["groq", "featherless"]
    message: str


@router.post("/echo", response_model=EchoResponse)
async def echo(req: EchoRequest):
    client, provider = route_client(human_waiting=req.human_waiting)
    if client is None:
        raise HTTPException(status_code=503, detail=f"{provider} not configured")

    schema_hint = '{"message": "<short string>"}'
    system = (
        "You are a JSON-only API. Reply with a single JSON object matching this schema: "
        f"{schema_hint}. No prose. No markdown fences."
    )
    data = await generate_json(
        client=client,
        system=system,
        user=req.prompt,
        schema_keys={"message"},
    )
    return EchoResponse(provider=provider, message=str(data.get("message", "")))
