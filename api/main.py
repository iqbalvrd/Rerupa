"""Entry point API Rerupa. Jalankan dari folder api/: uv run uvicorn main:app --reload"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from routes import health

settings = get_settings()

app = FastAPI(title="Rerupa API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,  # cookie sesi tamu
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Idempotency-Key"],
)

app.include_router(health.router)
