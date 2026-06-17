from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    s = get_settings()
    return {
        "ok": True,
        "providers": {
            "groq": bool(s.groq_api_key),
            "featherless": bool(s.featherless_api_key),
        },
        "supabase": bool(s.supabase_url and s.supabase_service_role),
    }
