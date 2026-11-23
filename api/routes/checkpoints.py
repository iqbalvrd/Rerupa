"""Checkpoint foto progres: POST/GET /sessions/{id}/checkpoints (PRD §10, FR10–FR11)."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import BaseModel

from core.config import get_settings
from core.errors import AppError, message_for
from core.idempotency import idempotency_key
from core.security import payload_hash, sha256_hex
from core.auth import CurrentUser, claim_session, current_user
from core.session import current_session, require_own_session
from core.supabase_client import get_supabase
from routes.jobs import JobOut, to_job_out
from services import events
from services import jobs as job_service
from services import progress as progress_svc
from services.storage import PRIVATE_URL_TTL, signed_urls
from services.uploads import BUCKET, clean_image, discard_upload, read_limited, store_upload

router = APIRouter(prefix="/sessions", tags=["checkpoints"])


def _parse_corners(raw: str, width: int, height: int) -> list[int]:
    """JSON 8 angka [x1,y1,…,x4,y4] dalam piksel foto yang dikirim (orientasi tampil). Urutan bebas."""
    try:
        values = json.loads(raw)
    except (ValueError, TypeError):
        raise AppError("validation_error", 422) from None
    if not isinstance(values, list) or len(values) != 8 or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        raise AppError("validation_error", 422)
    out = [round(float(v)) for v in values]
    margin = 0.02 * max(width, height)
    for i, v in enumerate(out):
        limit = width if i % 2 == 0 else height
        if v < -margin or v > limit + margin:
            raise AppError("validation_error", 422)
    return out


def _stage_job_counts(session_id: str, stage_id: str) -> tuple[int, int]:
    rows = (
        get_supabase()
        .table("jobs")
        .select("status")
        .eq("session_id", session_id)
        .eq("type", "feedback")
        .eq("stage_id", stage_id)
        .execute()
        .data
    )
    active = sum(1 for r in rows if r["status"] in ("queued", "processing", "succeeded"))
    return active, len(rows)


@router.post("/{session_id}/checkpoints", status_code=status.HTTP_202_ACCEPTED, response_model=JobOut)
def create_checkpoint(
    session_id: UUID,
    file: UploadFile = File(..., description="Foto progres: JPEG/PNG/WebP, maks 10 MB"),
    stage_code: str = Form(..., description="Kode tahap checkpoint, mis. stage_2"),
    corners: str = Form(..., description="JSON [x1,y1,…,x4,y4]: 4 sudut bidang lukis dalam piksel foto"),
    consent_ai_photo: bool = Form(False, description="Setuju foto progres dikirim ke penyedia AI"),
    key: str = Depends(idempotency_key),
    session: dict = Depends(current_session),
    user: CurrentUser = Depends(current_user),
) -> JobOut:
    require_own_session(session, str(session_id))
    claim_session(session, user)
    settings = get_settings()
    stage = progress_svc.find_stage(session, stage_code)
    if not stage["is_checkpoint"]:
        raise AppError("not_checkpoint", 422)

    original = read_limited(file.file, settings.max_upload_bytes)
    phash = payload_hash("feedback", sha256_hex(original), stage["id"], corners.strip(), str(consent_ai_photo))
    existing = job_service.find_existing(session["id"], "feedback", key, phash)
    if existing:
        return to_job_out(existing)

    active, total = _stage_job_counts(session["id"], stage["id"])
    if active >= settings.checkpoint_feedback_per_stage or total >= settings.checkpoint_attempts_per_stage:
        raise AppError("checkpoint_quota_exceeded", 429)

    clean = clean_image(original)
    corner_list = _parse_corners(corners, clean.width, clean.height)
    upload = store_upload(session["id"], original, clean, purpose="progress", stage_id=stage["id"], corners=corner_list)
    job, created = job_service.create_job(
        session["id"],
        "feedback",
        key,
        phash,
        upload_id=upload["id"],
        stage_id=stage["id"],
        lesson_version_id=session["lesson_version_id"],
        params={"consent_ai_photo": consent_ai_photo, "corners": corner_list, "stage_code": stage_code},
    )
    if not created:
        discard_upload(upload)
    else:
        events.record(session, "checkpoint_requested", {"stage_order": stage["order_no"]})
    return to_job_out(job)


# ---------------------------------------------------------------- hasil

class SuggestionOut(BaseModel):
    region_code: str  # rNN, atau "main" = siluet objek utama (lapisan main_object)
    observation: str
    action: str
    bbox: list[int] | None  # [x,y,w,h] di ruang koordinat lesson; hanya bila penyelarasan valid


class CheckpointOut(BaseModel):
    job_id: UUID
    stage_code: str | None
    status: str
    is_final: bool
    needs_retake: bool | None
    retake_code: str | None
    retake_message: str | None
    reasons: list[str]
    image_quality: str | None
    alignment: str | None
    summary: str | None
    suggestions: list[SuggestionOut]
    text_source: str | None
    generated_automatically: bool
    photo_url: str | None  # foto yang sudah diluruskan (rasio = lesson), signed 30 menit; null setelah dihapus
    created_at: str


def _checkpoint_rows(session_id: str, job_id: str | None = None) -> list[dict]:
    q = (
        get_supabase()
        .table("jobs")
        .select(
            "id, status, error_code, created_at, stage_id, upload_id, "
            "stages!jobs_stage_fk(code), feedback_results!feedback_results_job_id_fkey(*), uploads!jobs_upload_id_fkey(rectified_path)"
        )
        .eq("session_id", session_id)
        .eq("type", "feedback")
        .order("created_at", desc=True)
    )
    if job_id:
        q = q.eq("id", job_id)
    return q.execute().data


def _one(fr):
    if isinstance(fr, list):
        return fr[0] if fr else None
    return fr


def _out(rows: list[dict]) -> list[CheckpointOut]:
    paths = [r["uploads"]["rectified_path"] for r in rows if r.get("uploads") and r["uploads"].get("rectified_path")]
    urls = signed_urls(BUCKET, paths, PRIVATE_URL_TTL) if paths else {}
    out = []
    for r in rows:
        fr = _one(r.get("feedback_results"))
        final = r["status"] in ("succeeded", "needs_retake", "failed")
        path = (r.get("uploads") or {}).get("rectified_path")
        out.append(
            CheckpointOut(
                job_id=r["id"],
                stage_code=(r.get("stages") or {}).get("code"),
                status=r["status"],
                is_final=final,
                needs_retake=fr["needs_retake"] if fr else None,
                retake_code=r["error_code"] if r["status"] != "succeeded" else None,
                retake_message=message_for(r["error_code"]) if r["status"] != "succeeded" else None,
                reasons=(fr or {}).get("reasons") or [],
                image_quality=(fr or {}).get("image_quality"),
                alignment=(fr or {}).get("alignment"),
                summary=(fr or {}).get("summary"),
                suggestions=[SuggestionOut(**{k: s.get(k) for k in SuggestionOut.model_fields}) for s in (fr or {}).get("suggestions") or []],
                text_source=(fr or {}).get("text_source"),
                generated_automatically=True,
                photo_url=urls.get(path) if path else None,
                created_at=r["created_at"],
            )
        )
    return out


@router.get("/{session_id}/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(session_id: UUID, session: dict = Depends(current_session)) -> list[CheckpointOut]:
    """Semua checkpoint sesi ini, terbaru dulu. Teks feedback tetap ada walau foto sudah dihapus (FR13)."""
    require_own_session(session, str(session_id))
    return _out(_checkpoint_rows(session["id"]))


@router.get("/{session_id}/checkpoints/{job_id}", response_model=CheckpointOut)
def get_checkpoint(session_id: UUID, job_id: UUID, session: dict = Depends(current_session)) -> CheckpointOut:
    require_own_session(session, str(session_id))
    rows = _checkpoint_rows(session["id"], str(job_id))
    if not rows:
        raise AppError("not_found", 404)
    return _out(rows)[0]
