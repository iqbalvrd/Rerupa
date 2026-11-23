"""Entry point API Rerupa. Jalankan dari folder api/: uv run uvicorn main:app --reload"""

import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core import ratelimit
from core.config import get_settings
from core.errors import message_for, register_error_handlers
from core.logging_setup import setup_logging
from routes import admin, artworks, auth, checkpoints, health, jobs, lessons, palettes, progress, sessions, stories

settings = get_settings()
setup_logging()

# Produksi: tolak start bila konfigurasi penting salah (lebih baik gagal deploy daripada bocor/boros).
_problems = settings.production_problems()
if _problems:
    raise RuntimeError("Konfigurasi produksi belum benar: " + "; ".join(_problems))

# Batas ukuran seluruh body request: file 10 MB + ruang untuk field form multipart.
MAX_REQUEST_BYTES = settings.max_upload_bytes + 1024 * 1024

app = FastAPI(
    title="Rerupa API",
    version="0.1.0",
    docs_url="/docs" if settings.expose_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.expose_docs else None,
)


def _error(status: int, code: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message_for(code)}}, headers=headers)


_ORIGIN_RE = re.compile(settings.frontend_origin_regex) if settings.frontend_origin_regex else None
UNSAFE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


def origin_allowed(origin: str) -> bool:
    origin = origin.rstrip("/")
    return origin in settings.frontend_origins or bool(_ORIGIN_RE and _ORIGIN_RE.fullmatch(origin))


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    # Pertahanan CSRF berlapis: di produksi cookie memakai SameSite=None, jadi permintaan yang
    # mengubah data dari origin lain ditolak walau browser mengirim cookie. (Lapisan lain: header
    # Idempotency-Key / JSON memicu preflight CORS.) Klien tanpa header Origin (skrip, curl) tidak terdampak.
    origin = request.headers.get("origin")
    if request.method in UNSAFE_METHODS and origin and not origin_allowed(origin):
        return _error(403, "origin_not_allowed")
    wait = ratelimit.check(request, settings)
    if wait is not None:
        return _error(429, "rate_limited", {"Retry-After": str(wait)})
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith(("/sessions", "/jobs", "/lessons", "/events", "/auth", "/admin")):
        # Respons berisi data sesi & signed URL: jangan disimpan cache browser/proxy.
        response.headers.setdefault("Cache-Control", "no-store")
    if settings.environment == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return response


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
            return _error(413, "file_too_large")
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_origin_regex=settings.frontend_origin_regex or None,
    allow_credentials=True,  # cookie sesi tamu
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-Session-Token", "Authorization"],
    expose_headers=["Retry-After"],
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
app.include_router(stories.router)
app.include_router(auth.router)
app.include_router(admin.router)
