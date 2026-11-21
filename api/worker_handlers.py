"""Handler per jenis job. Tiap handler menerima baris job dan mengembalikan JobOutcome.

Aturan privasi untuk semua handler: sebelum foto dikirim ke penyedia AI, cek ulang bahwa sesi
belum dihapus dan params.consent_ai_photo = true.
"""

import logging
import threading
import uuid
from datetime import datetime
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass, field

from ai.lesson_text import PROMPT_VERSION, write_lesson_text
from core.config import get_settings
from core.session import now_utc
from core.supabase_client import get_supabase
from cv import pipeline
from cv.stage_planner import plan_stages
from services import jobs as job_service
from services.lessons import build_payload, save_lesson, upload_layers
from services.storage import with_retry

log = logging.getLogger("rerupa.worker")

HEARTBEAT_SECONDS = 30


@dataclass
class JobOutcome:
    status: str  # succeeded | needs_retake | failed
    result: dict | None = None
    error_code: str | None = None
    lesson_version_id: str | None = None
    extra: dict = field(default_factory=dict)


Handler = Callable[[dict], JobOutcome]


@contextmanager
def heartbeat(job: dict):
    """Thread latar yang memperbarui locked_at tiap 30 s selama handler berjalan."""
    stop = threading.Event()
    worker_id = job.get("locked_by")

    def beat():
        while not stop.wait(HEARTBEAT_SECONDS):
            try:
                if worker_id and not job_service.heartbeat(job["id"], worker_id):
                    return  # lock sudah tidak dipegang (mis. dianggap macet) — berhenti
            except Exception:
                log.warning("heartbeat_failed", extra={"job_id": job["id"]})

    t = threading.Thread(target=beat, daemon=True)
    t.start()
    try:
        yield
    finally:
        stop.set()
        t.join(timeout=2)


def _session(session_id: str) -> dict | None:
    rows = (
        get_supabase()
        .table("practice_sessions")
        .select("id, canvas_size, safety_id, deleted_at, expires_at")
        .eq("id", session_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def _session_alive(session_id: str) -> bool:
    s = _session(session_id)
    return bool(s and s["deleted_at"] is None and datetime.fromisoformat(s["expires_at"]) > now_utc())


def handle_generate_lesson(job: dict) -> JobOutcome:
    settings = get_settings()
    db = get_supabase()
    session = _session(job["session_id"])
    if session is None or session["deleted_at"] is not None:
        return JobOutcome("failed", error_code="session_deleted")

    upload = db.table("uploads").select("id, raw_path").eq("id", job["upload_id"]).limit(1).execute().data
    if not upload or not upload[0]["raw_path"]:
        return JobOutcome("failed", error_code="file_invalid")
    image = with_retry(lambda: db.storage.from_("uploads").download(upload[0]["raw_path"]), "download")

    params = job.get("params") or {}
    with heartbeat(job):
        job_service.set_progress(job["id"], "cv")
        cv = pipeline.run(
            image,
            scope=params.get("scope"),
            canvas_size=session["canvas_size"] or "A4",
            lineart_method=settings.lineart_method,
            mask_model=settings.mask_model,
        )
        if not cv.quality.usable:
            code = "not_artwork" if "low_contrast" in cv.quality.reasons and len(cv.regions) <= 2 else "photo_unusable"
            return JobOutcome("needs_retake", error_code=code, result={"reasons": cv.quality.reasons})

        job_service.set_progress(job["id"], "planning")
        stages = plan_stages(
            cv.regions,
            use_shading=cv.use_shading,
            checkpoint_count=settings.checkpoint_count,
            has_main_object_layer=cv.main_object_svg is not None,
        )

        job_service.set_progress(job["id"], "writing")
        text, source, notes = write_lesson_text(
            cv,
            stages,
            use_ai=bool(params.get("consent_ai_photo")),
            safety_id=session["safety_id"],
            job_id=job["id"],
            still_allowed=lambda: _session_alive(job["session_id"]),
        )

        # Sesi dihapus selama proses → jangan simpan apa pun.
        if not _session_alive(job["session_id"]):
            return JobOutcome("failed", error_code="session_deleted")

        job_service.set_progress(job["id"], "saving")
        prefix = f"{job['session_id']}/{uuid.uuid4()}"
        layers = upload_layers(cv, "derived", prefix)
        payload = build_payload(
            cv,
            stages,
            text,
            source,
            layers,
            lesson={
                "origin": "free_mode",
                "owner_session_id": job["session_id"],
                "source_upload_id": job["upload_id"],
                "scope": params.get("scope"),
                "checkpoint_count": settings.checkpoint_count,
                "prompt_version": PROMPT_VERSION if source == "ai" else None,
                "status": "session_private",
            },
            session_id=job["session_id"],
        )
        lesson_id = save_lesson(payload, layers)
        if source == "ai":
            db.table("uploads").update({"sent_to_ai": True}).eq("id", job["upload_id"]).execute()

    return JobOutcome(
        "succeeded",
        lesson_version_id=lesson_id,
        result={
            "text_source": source,
            "notes": notes,
            "region_count": len(cv.regions),
            "stage_count": len(stages),
            "use_shading": cv.use_shading,
            "warnings": cv.warnings,
            "timings_ms": cv.timings_ms,
        },
    )


HANDLERS: dict[str, Handler] = {
    "generate_lesson": handle_generate_lesson,
}
