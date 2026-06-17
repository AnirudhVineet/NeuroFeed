from functools import lru_cache
from openai import AsyncOpenAI

from ...config import get_settings


@lru_cache
def groq_client() -> AsyncOpenAI | None:
    s = get_settings()
    if not s.groq_api_key:
        return None
    return AsyncOpenAI(api_key=s.groq_api_key, base_url=s.groq_base_url)
