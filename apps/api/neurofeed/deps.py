from functools import lru_cache
from .config import get_settings


@lru_cache
def get_supabase_admin():
    """Service-role client. Lazy import so missing keys don't crash boot."""
    from supabase import create_client
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role:
        return None
    return create_client(s.supabase_url, s.supabase_service_role)
