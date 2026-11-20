"""Status job milik sesi: GET /jobs/{id}. Frontend melakukan polling tiap 1 detik sampai status final."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.errors import message_for
from core.session import current_session
from services.jobs import get_job_for_session

router = APIRouter(prefix="/jobs", tags=["jobs"])

JobStatus = Literal["queued", "processing", "succeeded", "needs_retake", "failed"]
FINAL_STATUSES = {"succeeded", "needs_retake", "failed"}


class JobOut(BaseModel):
    id: UUID
    type: str
    status: JobStatus
    is_final: bool
    progress: dict
    result: dict | None
    error_code: str | None
    error_message: str | None
    lesson_version_id: UUID | None
    created_at: str
    finished_at: str | None


def to_job_out(job: dict) -> JobOut:
    return JobOut(
        id=job["id"],
        type=job["type"],
        status=job["status"],
        is_final=job["status"] in FINAL_STATUSES,
        progress=job["progress"],
        result=job["result"],
        error_code=job["error_code"],
        error_message=message_for(job["error_code"]),
        lesson_version_id=job["lesson_version_id"],
        created_at=job["created_at"],
        finished_at=job["finished_at"],
    )


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: UUID, session: dict = Depends(current_session)) -> JobOut:
    return to_job_out(get_job_for_session(str(job_id), session["id"]))
