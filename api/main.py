"""Entry point API Rerupa. Jalankan dari folder api/: uv run uvicorn main:app --reload"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.errors import message_for, register_error_handlers
from core.logging_setup import setup_logging
from routes import artworks, checkpoints, health, jobs, lessons, palettes, progress, sessions

settings = get_settings()
setup_logging()

# Batas ukuran seluruh body request: file 10 MB + ruang untuk field form multipart.
MAX_REQUEST_BYTES = settings.max_upload_bytes + 1024 * 1024

app = FastAPI(title="Rerupa API", version="0.1.0")


@app.middleware("http")
async def reject_oversized_requests(request: Request, call_next):
    """Tolak request terlalu besar dari header Content-Length, sebelum body diterima seluruhnya."""
    length = request.headers.get("content-length")
    if length is not None:
        try:
            too_big = int(length) > MAX_REQUEST_BYTES
        except ValueError:
            too_big = True
        if too_big:
            return JSONResponse(
                status_code=413,
                content={"error": {"code": "file_too_large", "message": message_for("file_too_large")}},
            )
    return await call_next(request)


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
app.include_router(palettes.router)
app.include_router(progress.router)
app.include_router(checkpoints.router)
