"""Sesi tamu: POST/GET/PATCH/DELETE /sessions."""

from datetime import timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field

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
from services.jobs import cancel_queued_jobs

router = APIRouter(prefix="/sessions", tags=["sessions"])

CanvasSize = Literal["A4", "A3", "30x40"]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    palette_id: UUID | None = None
    canvas_size: CanvasSize | None = None


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
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


def _out(row: dict) -> SessionOut:
    return SessionOut(**{k: row[k] for k in SessionOut.model_fields})


def _check_palette(palette_id: UUID | None) -> None:
    if palette_id is None:
        return
    found = get_supabase().table("palettes").select("id").eq("id", str(palette_id)).limit(1).execute().data
    if not found:
        raise AppError("validation_error", 422)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SessionOut)
def create_session(body: SessionCreate, response: Response) -> SessionOut:
    _check_palette(body.palette_id)
    token = new_session_token()
    settings = get_settings()
    session_id = str(uuid4())  # acak; tidak pernah dipakai sebagai bukti akses

    row = (
        get_supabase()
        .table("practice_sessions")
        .insert(
            {
                "id": session_id,
                "token_hash": hash_token(token),
                "palette_id": str(body.palette_id) if body.palette_id else None,
                "canvas_size": body.canvas_size,
                "safety_id": safety_id_for(session_id),
                "expires_at": (now_utc() + timedelta(days=settings.session_ttl_days)).isoformat(),
            }
        )
        .execute()
        .data[0]
    )
    set_session_cookie(response, token)
    return _out(row)


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
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_session_cookie(response)
    return response


__all__ = ["router", "SESSION_COLUMNS"]
