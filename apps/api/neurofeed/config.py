from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Providers
    groq_api_key: str = ""
    featherless_api_key: str = ""

    groq_chat_model: str = "llama-3.3-70b-versatile"
    groq_reasoning_model: str = "openai/gpt-oss-120b"
    groq_stt_model: str = "whisper-large-v3"
    featherless_model: str = "meta-llama/Meta-Llama-3.1-70B-Instruct"

    groq_base_url: str = "https://api.groq.com/openai/v1"
    featherless_base_url: str = "https://api.featherless.ai/v1"

    # Featherless concurrency cap (build prompt: max 4)
    featherless_max_concurrency: int = 4

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role: str = ""

    # Queue
    upstash_redis_url: str = ""

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    # Includes desktop Vite (localhost + LAN IP) and the Capacitor WebView origins
    # used by the Android app. Override via CORS_ORIGINS env var if needed.
    cors_origins: str = (
        "http://localhost:5173,"
        "http://192.168.1.9:5173,"
        "http://localhost,"
        "https://localhost,"
        "capacitor://localhost"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
