"""Entry point API Rerupa. Jalankan dari folder api/: uv run uvicorn main:app --reload"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from core.errors import register_error_handlers
from core.logging_setup import setup_logging
from routes import artworks, health, jobs, lessons, sessions

settings = get_settings()
setup_logging()

app = FastAPI(title="Rerupa API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,  # cookie sesi tamu
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Idempotency-Key"],
)
register_error_handlers(app)

app.include_router(health.router)
app.include_router(artworks.router)
app.include_router(sessions.router)
app.include_router(jobs.router)
app.include_router(lessons.router)
