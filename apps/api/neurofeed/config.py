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
    huggingface_api_key: str = ""

    groq_chat_model: str = "llama-3.3-70b-versatile"
    groq_reasoning_model: str = "openai/gpt-oss-120b"
    groq_stt_model: str = "whisper-large-v3"

    groq_base_url: str = "https://api.groq.com/openai/v1"

    # Background ingest pipeline fans out ~10 generation calls per document;
    # this caps how many hit Groq at once so we don't blow past its RPM limit.
    groq_batch_max_concurrency: int = 2

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
