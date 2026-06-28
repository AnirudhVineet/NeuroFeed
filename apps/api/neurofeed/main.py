from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import actions, analytics, documents, feed, gamify, health, ingest, llm, messages, reels, social, tts, tutor


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="NeuroFeed API", version="0.0.1")

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(llm.router)
    app.include_router(ingest.router)
    app.include_router(documents.router)
    app.include_router(feed.router)
    app.include_router(actions.router)
    app.include_router(tutor.router)
    app.include_router(tts.router)
    app.include_router(gamify.router)
    app.include_router(analytics.router)
    app.include_router(social.router)
    app.include_router(messages.router)
    app.include_router(reels.router)
    return app


app = create_app()
