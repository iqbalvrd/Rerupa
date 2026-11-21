"""Handler job `feedback` (checkpoint foto progres). Dipisah dari worker_handlers.py agar tetap ringkas.

Alur: unduh foto + lapisan target → CV (kualitas, pelurusan, metrik, kandidat) → teks (AI/templat)
→ simpan foto lurus + feedback_results. Batas waktu PRD: 45 s; AI dilewati bila waktu hampir habis.
"""

import logging
import time

from ai.feedback import FeedbackText, write_feedback
from core.config import get_settings
from core.supabase_client import get_supabase
from cv import checkpoint as cp
from cv.compare import TargetRegion
from services import jobs as job_service
from services.storage import with_retry
from services.uploads import BUCKET
from worker_handlers import JobOutcome, _session, _session_alive, heartbeat

log = logging.getLogger("rerupa.worker")

AI_START_BUDGET_SECONDS = 25  # AI hanya dimulai bila masih ada ≥20 s sebelum batas 45 s


def _download(bucket: str, path: str) -> bytes:
    return with_retry(lambda: get_supabase().storage.from_(bucket).download(path), "download")


def load_target(lesson_id: str) -> tuple[dict, cp.TargetLesson, dict[str, str | None]]:
    db = get_supabase()
    lesson = db.table("lesson_versions").select("id, image_width, image_height, use_shading").eq("id", lesson_id).limit(1).execute().data[0]
    layers = {l["kind"]: l for l in db.table("visual_layers").select("kind, bucket, asset_path, meta").eq("lesson_version_id", lesson_id).execute().data}
    regions = db.table("regions").select("code, hex, area_pct, is_background, is_main_object, label").eq("lesson_version_id", lesson_id).order("code").execute().data

    def svg(kind: str) -> str | None:
        layer = layers.get(kind)
        return _download(layer["bucket"], layer["asset_path"]).decode("utf-8") if layer else None

    grid_meta = (layers.get("grid") or {}).get("meta") or {}
    target = cp.TargetLesson(
        width=lesson["image_width"],
        height=lesson["image_height"],
        regions_svg=svg("regions") or "",
        sketch_svg=svg("sketch") or "",
        main_object_svg=svg("main_object"),
        regions=[TargetRegion(r["code"], r["hex"], float(r["area_pct"]), r["is_background"], r["is_main_object"]) for r in regions],
        grid=(int(grid_meta.get("cols", 4)), int(grid_meta.get("rows", 4))),
    )
    return lesson, target, {r["code"]: r["label"] for r in regions}


def open_region_codes(lesson_id: str, order_no: int) -> set[str]:
    rows = (
        get_supabase()
        .table("stages")
        .select("order_no, stage_regions(regions(code))")
        .eq("lesson_version_id", lesson_id)
        .lte("order_no", order_no)
        .execute()
        .data
    )
    return {sr["regions"]["code"] for s in rows for sr in s.get("stage_regions") or [] if sr.get("regions")}


def _save_result(job: dict, stage_id: str, res: cp.CheckpointCV, text: FeedbackText | None, source: str | None) -> None:
    by_code = {c["region_code"]: c for c in res.candidates}
    suggestions = []
    if text is not None and not res.needs_retake:
        for s in text.suggestions:
            c = by_code.get(s.region_code)
            # Penanda hanya bila penyelarasan valid (PRD §13) — saran hanya ada bila alignment confirmed.
            suggestions.append({**s.model_dump(), "bbox": c["bbox"] if c and res.alignment == "confirmed" else None})
    get_supabase().table("feedback_results").upsert(
        {
            "job_id": job["id"],
            "session_id": job["session_id"],
            "stage_id": stage_id,
            "upload_id": job["upload_id"],
            "image_quality": res.image_quality,
            "alignment": res.alignment,
            "alignment_method": res.alignment_method,
            "needs_retake": res.needs_retake,
            "reasons": res.reasons,
            "metrics": res.metrics,
            "candidates": res.candidates,
            "summary": text.summary if text else None,
            "suggestions": suggestions,
            "text_source": source,
        },
        on_conflict="job_id",
    ).execute()


def handle_feedback(job: dict) -> JobOutcome:
    started = time.monotonic()
    settings = get_settings()
    db = get_supabase()
    session = _session(job["session_id"])
    if session is None or session["deleted_at"] is not None:
        return JobOutcome("failed", error_code="session_deleted")

    upload = db.table("uploads").select("id, raw_path").eq("id", job["upload_id"]).limit(1).execute().data
    stage = db.table("stages").select("id, code, order_no, kind, title, is_checkpoint, lesson_version_id").eq("id", job["stage_id"]).limit(1).execute().data
    if not upload or not upload[0]["raw_path"] or not stage or not stage[0]["is_checkpoint"]:
        return JobOutcome("failed", error_code="file_invalid")
    stage = stage[0]
    params = job.get("params") or {}

    with heartbeat(job):
        job_service.set_progress(job["id"], "cv")
        photo = _download(BUCKET, upload[0]["raw_path"])
        lesson, target, labels = load_target(stage["lesson_version_id"])
        res = cp.run(photo, params["corners"], target, stage["kind"], open_region_codes(lesson["id"], stage["order_no"]))

        if res.needs_retake:
            _save_result(job, stage["id"], res, None, None)
            return JobOutcome("needs_retake", error_code=res.retake_code, result={"reasons": res.reasons, "timings_ms": res.timings_ms})

        job_service.set_progress(job["id"], "writing")
        time_left = settings.feedback_deadline_seconds - (time.monotonic() - started)
        text, source, notes = write_feedback(
            stage_kind=stage["kind"],
            stage_title=stage["title"],
            candidates=res.candidates,
            metrics=res.metrics,
            labels=labels,
            use_shading=lesson["use_shading"],
            overlay_jpeg=res.overlay_jpeg,
            use_ai=bool(params.get("consent_ai_photo")) and time_left >= AI_START_BUDGET_SECONDS,
            safety_id=session["safety_id"],
            job_id=job["id"],
            still_allowed=lambda: _session_alive(job["session_id"]),
        )
        if not _session_alive(job["session_id"]):
            return JobOutcome("failed", error_code="session_deleted")
        if not job_service.still_mine(job["id"], job.get("locked_by")):
            return JobOutcome("failed", error_code="worker_timeout")

        job_service.set_progress(job["id"], "saving")
        rect_path = f"{job['session_id']}/{job['upload_id']}_rectified.jpg"
        storage = db.storage.from_(BUCKET)
        with_retry(lambda: storage.upload(rect_path, res.rectified_jpeg, {"content-type": "image/jpeg", "upsert": "true"}), "upload_rectified")
        db.table("uploads").update({"rectified_path": rect_path, "sent_to_ai": source == "ai", "quality": res.metrics.get("quality")}).eq("id", job["upload_id"]).execute()
        _save_result(job, stage["id"], res, text, source)

    return JobOutcome(
        "succeeded",
        result={
            "suggestion_count": len(text.suggestions),
            "text_source": source,
            "notes": notes,
            "alignment_method": res.alignment_method,
            "timings_ms": res.timings_ms,
        },
    )
