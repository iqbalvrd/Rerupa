"""Sesi latihan: POST/GET/PATCH/DELETE /sessions. Membuat sesi wajib masuk akun; akses berikutnya memakai token sesi."""

import logging
from datetime import timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field

from core.auth import CurrentUser, current_user
from core.config import get_settings
from core.errors import AppError
from core.security import hash_token, new_session_token, safety_id_for
from core.session import (
    SESSION_COLUMNS,
    clear_session_cookie,
    current_session,
    now_utc,
    require_own_session,
    set_session_cookie,
)
from core.supabase_client import get_supabase
from services import events
from services.jobs import cancel_queued_jobs
from services.uploads import purge_session_files

log = logging.getLogger("rerupa.sessions")
router = APIRouter(prefix="/sessions", tags=["sessions"])

CanvasSize = Literal["A4", "A3", "30x40"]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    palette_id: UUID | None = None
    canvas_size: CanvasSize | None = None
    lesson_version_id: UUID | None = Field(default=None, description="Materi koleksi terbit yang akan dilatih (dari GET /artworks)")


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lesson_version_id: UUID | None = None
    palette_id: UUID | None = None
    canvas_size: CanvasSize | None = None
    current_stage_order: int | None = Field(default=None, ge=1, le=8)


class SessionOut(BaseModel):
    id: UUID
    lesson_version_id: UUID | None
    palette_id: UUID | None
    canvas_size: CanvasSize | None
    current_stage_order: int
    consent: dict
    expires_at: str
    # Hanya di respons POST /sessions: dikirim ulang lewat header X-Session-Token bila browser memblokir cookie.
    session_token: str | None = None


def _out(row: dict, token: str | None = None) -> SessionOut:
    return SessionOut(**{k: row[k] for k in SessionOut.model_fields if k != "session_token"}, session_token=token)


def _check_lesson(lesson_id: UUID | None, session_id: str | None) -> None:
    """Hanya materi koleksi terbit atau tutorial mode bebas milik sesi ini. Selain itu 404 (tidak membocorkan)."""
    if lesson_id is None:
        return
    rows = get_supabase().table("lesson_versions").select("origin, status, owner_session_id").eq("id", str(lesson_id)).limit(1).execute().data
    ok = bool(rows) and (
        (rows[0]["origin"] == "collection" and rows[0]["status"] == "published")
        or (rows[0]["origin"] == "free_mode" and session_id is not None and rows[0]["owner_session_id"] == session_id)
    )
    if not ok:
        raise AppError("not_found", 404)


def _check_palette(palette_id: UUID | None) -> None:
    if palette_id is None:
        return
    found = get_supabase().table("palettes").select("id").eq("id", str(palette_id)).limit(1).execute().data
    if not found:
        raise AppError("validation_error", 422)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SessionOut)
def create_session(body: SessionCreate, response: Response, user: CurrentUser = Depends(current_user)) -> SessionOut:
    """Mulai latihan butuh akun (tamu hanya melihat koleksi & tutorial)."""
    _check_palette(body.palette_id)
    _check_lesson(body.lesson_version_id, None)
    token = new_session_token()
    settings = get_settings()
    session_id = str(uuid4())  # acak; tidak pernah dipakai sebagai bukti akses

    row = (
        get_supabase()
        .table("practice_sessions")
        .insert(
            {
                "id": session_id,
                "user_id": user.id,
                "token_hash": hash_token(token),
                "palette_id": str(body.palette_id) if body.palette_id else None,
                "lesson_version_id": str(body.lesson_version_id) if body.lesson_version_id else None,
                "canvas_size": body.canvas_size,
                "safety_id": safety_id_for(session_id),
                "expires_at": (now_utc() + timedelta(days=settings.session_ttl_days)).isoformat(),
            }
        )
        .execute()
        .data[0]
    )
    set_session_cookie(response, token)
    return _out(row, token)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: UUID, session: dict = Depends(current_session)) -> SessionOut:
    require_own_session(session, str(session_id))
    return _out(session)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(session_id: UUID, body: SessionUpdate, session: dict = Depends(current_session)) -> SessionOut:
    require_own_session(session, str(session_id))
    changes = body.model_dump(exclude_unset=True, mode="json")
    if not changes:
        return _out(session)
    if "palette_id" in changes:
        _check_palette(body.palette_id)
    if "lesson_version_id" in changes:
        if body.lesson_version_id is None:
            raise AppError("validation_error", 422)
        _check_lesson(body.lesson_version_id, session["id"])
        if changes["lesson_version_id"] != session.get("lesson_version_id") and "current_stage_order" not in changes:
            changes["current_stage_order"] = 1
    row = (
        get_supabase()
        .table("practice_sessions")
        .update(changes)
        .eq("id", session["id"])
        .execute()
        .data[0]
    )
    return _out(row)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: UUID, response: Response, session: dict = Depends(current_session)) -> Response:
    """Mencabut akses seketika. Data dan file dibersihkan pekerjaan retensi (≤24 jam, Fase 7)."""
    require_own_session(session, str(session_id))
    get_supabase().table("practice_sessions").update({"deleted_at": now_utc().isoformat()}).eq(
        "id", session["id"]
    ).execute()
    cancel_queued_jobs(session["id"])
    events.record(session, "session_deleted")
    try:
        purge_session_files(session["id"])
    except Exception:
        # Akses sudah dicabut; file yang gagal dihapus sekarang dibersihkan pekerjaan retensi.
        log.exception("purge_on_delete_failed", extra={"session_id": session["id"]})
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_session_cookie(response)
    return response


__all__ = ["router", "SESSION_COLUMNS"]
