"""Dependency sesi tamu: membaca cookie (atau header cadangan), memverifikasi hash di DB, dan menolak sesi
kedaluwarsa/terhapus.

Header `X-Session-Token` adalah cadangan untuk browser yang memblokir cookie lintas situs (Safari iOS,
mode privat): frontend di *.vercel.app dan API di *.up.railway.app berbeda situs, jadi cookie sesi
dianggap cookie pihak ketiga. Token yang sama dikirim di respons POST /sessions."""

from datetime import UTC, datetime, timedelta

from fastapi import Request, Response

from core.config import get_settings
from core.errors import AppError
from core.security import hash_token
from core.supabase_client import get_supabase

SESSION_COLUMNS = (
    "id, lesson_version_id, palette_id, canvas_size, current_stage_order, consent, safety_id, "
    "created_at, last_seen_at, expires_at"
)


SESSION_HEADER = "X-Session-Token"


def now_utc() -> datetime:
    return datetime.now(UTC)


def current_session(request: Request) -> dict:
    """Sesi milik pemegang cookie. Selalu dipakai sebagai sumber session_id — bukan ID di URL."""
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name) or request.headers.get(SESSION_HEADER)
    if not token or len(token) > 128:
        raise AppError("session_required", 401)

    rows = (
        get_supabase()
        .table("practice_sessions")
        .select(SESSION_COLUMNS)
        .eq("token_hash", hash_token(token))
        .is_("deleted_at", "null")
        .gt("expires_at", now_utc().isoformat())
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise AppError("session_required", 401)
    session = rows[0]
    _touch(session)
    return session


def _touch(session: dict) -> None:
    """Perbarui last_seen_at paling sering sekali per 5 menit agar tidak menulis DB tiap request."""
    last_seen = datetime.fromisoformat(session["last_seen_at"])
    if now_utc() - last_seen > timedelta(minutes=5):
        get_supabase().table("practice_sessions").update({"last_seen_at": now_utc().isoformat()}).eq(
            "id", session["id"]
        ).execute()


def require_own_session(session: dict, session_id: str) -> None:
    """ID di URL harus sama dengan sesi pemegang cookie; selain itu dianggap tidak ada (404)."""
    if str(session["id"]) != str(session_id):
        raise AppError("not_found", 404)


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
