"""Tutorial mode bebas: POST /lessons/generate (unggah foto → job latar).

GET /lessons/:id menyusul di Fase 3 bersama tabel lesson_versions.
"""

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from core.config import get_settings
from core.errors import AppError
from core.idempotency import idempotency_key
from core.security import payload_hash, sha256_hex
from core.session import current_session, now_utc
from core.supabase_client import get_supabase
from routes.jobs import JobOut, to_job_out
from services import jobs as job_service
from services.uploads import clean_image, discard_upload, read_limited, store_upload

router = APIRouter(prefix="/lessons", tags=["lessons"])

CONSENT_TEXT_VERSION = "v1"


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED, response_model=JobOut)
def generate_lesson(
    file: UploadFile = File(..., description="Foto karya: JPEG/PNG/WebP, maks 10 MB"),
    consent_ai_photo: bool = Form(..., description="Pengguna setuju foto dikirim ke penyedia AI"),
    key: str = Depends(idempotency_key),
    session: dict = Depends(current_session),
) -> JobOut:
    settings = get_settings()
    original = read_limited(file.file, settings.max_upload_bytes)
    phash = payload_hash("generate_lesson", sha256_hex(original), str(consent_ai_photo))

    # Permintaan ulang (klik ganda, retry jaringan) → job yang sama, tanpa unggah atau biaya ganda.
    existing = job_service.find_existing(session["id"], "generate_lesson", key, phash)
    if existing:
        return to_job_out(existing)

    if job_service.count_jobs(session["id"], "generate_lesson") >= settings.generate_quota_per_session:
        raise AppError("quota_exceeded", 429)

    clean = clean_image(original)
    upload = store_upload(session["id"], original, clean, purpose="reference")

    job, created = job_service.create_job(
        session["id"],
        "generate_lesson",
        key,
        phash,
        upload_id=upload["id"],
        params={"consent_ai_photo": consent_ai_photo},
    )
    if not created:
        discard_upload(upload)

    get_supabase().table("practice_sessions").update(
        {
            "consent": {
                "ai_photo": consent_ai_photo,
                "at": now_utc().isoformat(),
                "text_version": CONSENT_TEXT_VERSION,
            }
        }
    ).eq("id", session["id"]).execute()

    return to_job_out(job)
