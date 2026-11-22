"""Handler job `generate_story` (storyline P1). Lihat story/service.py untuk alurnya."""

import logging

from ai import openai_client as oc
from core.supabase_client import get_supabase
from services import jobs as job_service
from story.service import build_story
from worker_handlers import JobOutcome, _session, _session_alive, heartbeat

log = logging.getLogger("rerupa.worker")


def handle_generate_story(job: dict) -> JobOutcome:
    session = _session(job["session_id"])
    if session is None or session["deleted_at"] is not None:
        return JobOutcome("failed", error_code="session_deleted")
    params = job.get("params") or {}
    try:
        oc.ensure_available()
    except oc.AIUnavailable as exc:
        return JobOutcome("failed", error_code=exc.code)

    with heartbeat(job):
        try:
            out = build_story(
                job["lesson_version_id"], job["session_id"], params,
                safety_id=session["safety_id"], job_id=job["id"],
                progress=lambda step: job_service.set_progress(job["id"], step),
            )
        except oc.AIUnavailable as exc:
            return JobOutcome("failed", error_code=exc.code)
        except ValueError:
            log.exception("story_invalid", extra={"job_id": job["id"]})
            return JobOutcome("failed", error_code="ai_unavailable")

    if not _session_alive(job["session_id"]):
        return JobOutcome("failed", error_code="session_deleted")
    get_supabase().table("jobs").update({"story_id": out.story_id}).eq("id", job["id"]).execute()
    return JobOutcome("succeeded", result={"kind": "story", "story_id": out.story_id})
