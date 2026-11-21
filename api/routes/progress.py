"""Progres latihan: GET/PATCH /sessions/{id}/progress dan POST /events."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from core.errors import AppError
from core.session import current_session, require_own_session
from core.supabase_client import get_supabase
from services import events
from services import progress as svc

router = APIRouter(tags=["progress"])


class ProgressUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage_code: str = Field(min_length=1, max_length=40)
    status: Literal["viewed", "completed"]


class StageProgressOut(BaseModel):
    code: str
    order_no: int
    is_checkpoint: bool
    status: Literal["not_started", "viewed", "completed"]
    viewed_at: str | None
    completed_at: str | None
    feedback_count: int


class ProgressOut(BaseModel):
    lesson_version_id: UUID
    current_stage_order: int
    completed_count: int
    stage_count: int
    stages: list[StageProgressOut]


def _progress_out(session: dict) -> ProgressOut:
    lid = svc.require_lesson(session)
    stages = svc.lesson_stages(lid)
    rows = svc.progress_rows(session["id"], [s["id"] for s in stages])
    fb = (
        get_supabase()
        .table("feedback_results")
        .select("stage_id")
        .eq("session_id", session["id"])
        .eq("needs_retake", False)
        .execute()
        .data
    )
    fb_count: dict[str, int] = {}
    for r in fb:
        fb_count[r["stage_id"]] = fb_count.get(r["stage_id"], 0) + 1
    current = get_supabase().table("practice_sessions").select("current_stage_order").eq("id", session["id"]).limit(1).execute().data
    out = [
        StageProgressOut(
            code=s["code"],
            order_no=s["order_no"],
            is_checkpoint=s["is_checkpoint"],
            status=rows.get(s["id"], {}).get("status", "not_started"),
            viewed_at=rows.get(s["id"], {}).get("viewed_at"),
            completed_at=rows.get(s["id"], {}).get("completed_at"),
            feedback_count=fb_count.get(s["id"], 0),
        )
        for s in stages
    ]
    return ProgressOut(
        lesson_version_id=lid,
        current_stage_order=current[0]["current_stage_order"] if current else session["current_stage_order"],
        completed_count=sum(1 for s in out if s.status == "completed"),
        stage_count=len(out),
        stages=out,
    )


@router.get("/sessions/{session_id}/progress", response_model=ProgressOut)
def get_progress(session_id: UUID, session: dict = Depends(current_session)) -> ProgressOut:
    require_own_session(session, str(session_id))
    return _progress_out(session)


@router.patch("/sessions/{session_id}/progress", response_model=ProgressOut)
def update_progress(session_id: UUID, body: ProgressUpdate, session: dict = Depends(current_session)) -> ProgressOut:
    """viewed = tahap dibuka; completed = pengguna menandai selesai. Checkpoint boleh dilewati:
    tahap checkpoint bisa completed tanpa foto (PRD §6), dan tidak dianggap sudah mendapat feedback."""
    require_own_session(session, str(session_id))
    stage = svc.find_stage(session, body.stage_code)
    svc.mark(session, stage, body.status)
    return _progress_out(session)


# ---------------------------------------------------------------- event dari frontend

class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    props: dict = Field(default_factory=dict)


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
def post_event(body: EventIn, request: Request) -> Response:
    if body.name not in events.CLIENT_EVENTS:
        raise AppError("validation_error", 422)
    props = {}
    for k, v in body.props.items():
        if k not in events.ALLOWED_PROPS:
            continue
        if k == "stage_order" and isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 8:
            props[k] = v
        elif k == "origin" and v in ("collection", "free_mode"):
            props[k] = v
        elif k == "correct" and isinstance(v, bool):
            props[k] = v
        elif k == "lesson_version_id" and isinstance(v, str):
            try:
                props[k] = str(UUID(v))
            except ValueError:
                pass
    try:
        session = current_session(request)
    except AppError:
        session = None
    events.record(session, body.name, props)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
