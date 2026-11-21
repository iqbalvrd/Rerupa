"""Antrean job: pembuatan idempoten, pembacaan per sesi, dan penyelesaian oleh worker."""

from typing import Any

from postgrest.exceptions import APIError

from core.errors import AppError
from core.session import now_utc
from core.supabase_client import get_supabase

UNIQUE_VIOLATION = "23505"

JOB_COLUMNS = (
    "id, session_id, type, status, payload_hash, progress, result, error_code, "
    "upload_id, stage_id, lesson_version_id, attempts, created_at, finished_at"
)


def _find_by_key(session_id: str, job_type: str, key: str) -> dict | None:
    rows = (
        get_supabase()
        .table("jobs")
        .select(JOB_COLUMNS)
        .eq("session_id", session_id)
        .eq("type", job_type)
        .eq("idempotency_key", key)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def find_existing(session_id: str, job_type: str, key: str, payload_hash: str) -> dict | None:
    """Job yang sudah dibuat dengan kunci ini, atau None. Kunci sama + isi beda → 409."""
    existing = _find_by_key(session_id, job_type, key)
    if existing and existing["payload_hash"] != payload_hash:
        raise AppError("idempotency_conflict", 409)
    return existing


def create_job(session_id: str, job_type: str, key: str, payload_hash: str, **fields: Any) -> tuple[dict, bool]:
    """Buat job baru atau kembalikan job lama dengan kunci yang sama. Return (job, dibuat_baru)."""
    existing = find_existing(session_id, job_type, key, payload_hash)
    if existing:
        return existing, False
    row = {
        "session_id": session_id,
        "type": job_type,
        "idempotency_key": key,
        "payload_hash": payload_hash,
        **fields,
    }
    try:
        created = get_supabase().table("jobs").insert(row).execute().data[0]
        return created, True
    except APIError as exc:
        # Dua request bersamaan dengan kunci sama: yang kalah mengambil job pemenang.
        if exc.code == UNIQUE_VIOLATION:
            existing = find_existing(session_id, job_type, key, payload_hash)
            if existing:
                return existing, False
        raise


def count_jobs(session_id: str, job_type: str) -> int:
    """Job yang dihitung untuk kuota: yang gagal karena sistem (timeout, error server) tidak memakan kuota."""
    res = (
        get_supabase()
        .table("jobs")
        .select("id", count="exact")
        .eq("session_id", session_id)
        .eq("type", job_type)
        .neq("status", "failed")
        .execute()
    )
    return res.count or 0


def get_job_for_session(job_id: str, session_id: str) -> dict:
    rows = (
        get_supabase()
        .table("jobs")
        .select(JOB_COLUMNS)
        .eq("id", job_id)
        .eq("session_id", session_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise AppError("not_found", 404)
    return rows[0]


# ---------- dipakai worker ----------

def claim_job(worker_id: str, types: list[str], session_id: str | None = None) -> dict | None:
    """Klaim job antre tertua. Job dari sesi yang dihapus/kedaluwarsa tidak pernah diambil (lihat migrasi 8)."""
    rows = (
        get_supabase()
        .rpc("claim_job", {"p_worker": worker_id, "p_types": types, "p_session_id": session_id})
        .execute()
        .data
    )
    return rows[0] if rows else None


def cancel_queued_jobs(session_id: str) -> None:
    """Dipanggil saat sesi dihapus: job yang belum jalan dibatalkan agar foto tidak diproses lagi."""
    get_supabase().table("jobs").update(
        {
            "status": "failed",
            "error_code": "session_deleted",
            "finished_at": now_utc().isoformat(),
            "progress": {"step": "done"},
        }
    ).eq("session_id", session_id).eq("status", "queued").execute()


def requeue_stale(stale_after_seconds: int) -> int:
    res = get_supabase().rpc(
        "requeue_stale_jobs", {"p_stale_after": f"{stale_after_seconds} seconds", "p_max_attempts": 2}
    ).execute()
    return int(res.data or 0)


def fail_overdue(deadlines: dict[str, int], grace_seconds: int) -> int:
    """PRD §16: job yang belum selesai melewati batas tunggu (dihitung sejak dibuat) → failed/worker_timeout.

    Frontend menampilkan "Proses terlalu lama. Coba lagi." Bila worker yang lambat akhirnya selesai,
    finish_job-nya tidak berlaku lagi (status sudah bukan processing).
    """
    from datetime import timedelta

    total = 0
    for job_type, seconds in deadlines.items():
        cutoff = (now_utc() - timedelta(seconds=seconds + grace_seconds)).isoformat()
        rows = (
            get_supabase()
            .table("jobs")
            .update({"status": "failed", "error_code": "worker_timeout", "finished_at": now_utc().isoformat(), "progress": {"step": "done"}, "locked_by": None, "locked_at": None})
            .eq("type", job_type)
            .in_("status", ["queued", "processing"])
            .lt("created_at", cutoff)
            .execute()
            .data
        )
        total += len(rows)
    return total


def still_mine(job_id: str, worker_id: str | None) -> bool:
    """Job masih dipegang worker ini (belum dianggap macet/terlambat). Cek sebelum menyimpan hasil."""
    q = get_supabase().table("jobs").select("id").eq("id", job_id).eq("status", "processing")
    if worker_id:
        q = q.eq("locked_by", worker_id)
    return bool(q.limit(1).execute().data)


def heartbeat(job_id: str, worker_id: str) -> bool:
    """Perbarui locked_at agar job yang berjalan lama tidak dianggap macet oleh requeue_stale_jobs."""
    rows = (
        get_supabase()
        .table("jobs")
        .update({"locked_at": now_utc().isoformat()})
        .eq("id", job_id)
        .eq("status", "processing")
        .eq("locked_by", worker_id)
        .execute()
        .data
    )
    return bool(rows)


def set_progress(job_id: str, step: str, **extra: Any) -> None:
    get_supabase().table("jobs").update({"progress": {"step": step, **extra}}).eq("id", job_id).execute()


def finish_job(
    job_id: str,
    worker_id: str,
    status: str,
    *,
    result: dict | None = None,
    error_code: str | None = None,
    lesson_version_id: str | None = None,
) -> bool:
    """Tandai job selesai. Hanya berhasil bila job masih dipegang worker ini (cegah balapan dengan requeue)."""
    if status not in {"succeeded", "needs_retake", "failed"}:
        raise ValueError(f"status akhir tidak valid: {status}")
    changes: dict[str, Any] = {
        "status": status,
        "result": result,
        "error_code": error_code,
        "progress": {"step": "done"},
        "finished_at": now_utc().isoformat(),
        "locked_by": None,
        "locked_at": None,
    }
    if lesson_version_id:
        changes["lesson_version_id"] = lesson_version_id
    rows = (
        get_supabase()
        .table("jobs")
        .update(changes)
        .eq("id", job_id)
        .eq("status", "processing")
        .eq("locked_by", worker_id)
        .execute()
        .data
    )
    return bool(rows)
