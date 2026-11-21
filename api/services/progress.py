"""Progres tahap per sesi. "Melihat" tahap tidak sama dengan "menyelesaikan" (PRD FR13)."""

from core.errors import AppError
from core.session import now_utc
from core.supabase_client import get_supabase
from services import events


def lesson_stages(lesson_version_id: str) -> list[dict]:
    return (
        get_supabase()
        .table("stages")
        .select("id, code, order_no, kind, is_checkpoint, title")
        .eq("lesson_version_id", lesson_version_id)
        .order("order_no")
        .execute()
        .data
    )


def require_lesson(session: dict) -> str:
    lid = session.get("lesson_version_id")
    if not lid:
        raise AppError("lesson_required", 409)
    return lid


def find_stage(session: dict, stage_code: str) -> dict:
    for s in lesson_stages(require_lesson(session)):
        if s["code"] == stage_code:
            return s
    raise AppError("not_found", 404)


def progress_rows(session_id: str, stage_ids: list[str]) -> dict[str, dict]:
    if not stage_ids:
        return {}
    rows = (
        get_supabase()
        .table("stage_progress")
        .select("stage_id, status, viewed_at, completed_at")
        .eq("session_id", session_id)
        .in_("stage_id", stage_ids)
        .execute()
        .data
    )
    return {r["stage_id"]: r for r in rows}


def mark(session: dict, stage: dict, status: str) -> None:
    """status viewed | completed. Viewed tidak pernah menurunkan tahap yang sudah completed."""
    db = get_supabase()
    sid = session["id"]
    existing = progress_rows(sid, [stage["id"]]).get(stage["id"])
    first_ever = existing is None and not db.table("stage_progress").select("stage_id").eq("session_id", sid).limit(1).execute().data

    if status == "viewed":
        if existing is None:
            db.table("stage_progress").upsert(
                {"session_id": sid, "stage_id": stage["id"], "status": "viewed"},
                on_conflict="session_id,stage_id",
                ignore_duplicates=True,
            ).execute()
    elif status == "completed":
        if existing is None or existing["status"] != "completed":
            db.table("stage_progress").upsert(
                {"session_id": sid, "stage_id": stage["id"], "status": "completed", "completed_at": now_utc().isoformat()},
                on_conflict="session_id,stage_id",
            ).execute()
            events.record(session, "stage_completed", {"stage_order": stage["order_no"]})
            _maybe_lesson_completed(session)
    else:
        raise ValueError(status)

    db.table("practice_sessions").update({"current_stage_order": stage["order_no"]}).eq("id", sid).execute()
    if first_ever:
        events.record(session, "practice_started", {"lesson_version_id": session.get("lesson_version_id")})


def _maybe_lesson_completed(session: dict) -> None:
    stages = lesson_stages(session["lesson_version_id"])
    rows = progress_rows(session["id"], [s["id"] for s in stages])
    if stages and all(rows.get(s["id"], {}).get("status") == "completed" for s in stages):
        events.record(session, "lesson_completed", {"lesson_version_id": session["lesson_version_id"]})
