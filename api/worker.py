"""Worker Rerupa: mengambil job dari tabel `jobs` lalu menjalankannya.

Jalankan dari folder api/: uv run python worker.py
- Klaim atomik lewat RPC claim_job (FOR UPDATE SKIP LOCKED), aman untuk banyak worker.
- Job yang macet (worker mati) dikembalikan ke antrean oleh requeue_stale_jobs, maks 2 percobaan.
- Error tak terduga di handler → job failed/internal_error; detail hanya di log.
"""

import logging
import os
import socket
import time
import uuid

from core.config import get_settings
from core.logging_setup import setup_logging
from services import jobs as job_service
from worker_handlers import HANDLERS, Handler

log = logging.getLogger("rerupa.worker")

REQUEUE_EVERY_SECONDS = 30


def make_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"


def process_one(worker_id: str, handlers: dict[str, Handler] = HANDLERS, session_id: str | None = None) -> bool:
    """Ambil dan jalankan satu job. Return False bila antrean kosong.

    session_id membatasi ke satu sesi (dipakai tes); worker produksi memanggil tanpa filter.
    """
    # Feedback checkpoint didahulukan: cepat (±1–3 s CV) dan pengguna sedang menunggu di layar (P95 ≤30 s).
    job = None
    if "feedback" in handlers:
        job = job_service.claim_job(worker_id, ["feedback"], session_id)
    if job is None:
        job = job_service.claim_job(worker_id, list(handlers), session_id)
    if job is None:
        return False

    started = time.monotonic()
    log.info("job_started", extra={"job_id": job["id"], "type": job["type"], "attempt": job["attempts"]})
    try:
        outcome = handlers[job["type"]](job)
        finished = job_service.finish_job(
            job["id"],
            worker_id,
            outcome.status,
            result=outcome.result,
            error_code=outcome.error_code,
            lesson_version_id=outcome.lesson_version_id,
        )
    except Exception:
        log.exception("job_crashed", extra={"job_id": job["id"], "type": job["type"]})
        finished = job_service.finish_job(job["id"], worker_id, "failed", error_code="internal_error")
        outcome = None

    log.info(
        "job_finished",
        extra={
            "job_id": job["id"],
            "type": job["type"],
            "status": outcome.status if outcome else "failed",
            "error_code": outcome.error_code if outcome else "internal_error",
            "duration_ms": int((time.monotonic() - started) * 1000),
            "recorded": finished,  # False = lock sudah diambil alih (mis. dianggap macet)
        },
    )
    return True


def main() -> None:
    setup_logging()
    settings = get_settings()
    worker_id = make_worker_id()
    log.info("worker_started", extra={"worker_id": worker_id, "types": list(HANDLERS)})
    try:
        from cv.models import warm_up

        log.info("models_warmed", extra=warm_up(settings.lineart_method, settings.mask_model))
    except Exception:
        # Worker tetap jalan; pipeline punya cadangan XDoG bila model gagal dimuat.
        log.exception("model_warm_up_failed")

    last_requeue = 0.0
    try:
        while True:
            now = time.monotonic()
            if now - last_requeue > REQUEUE_EVERY_SECONDS:
                moved = job_service.requeue_stale(settings.worker_stale_after_seconds)
                if moved:
                    log.warning("stale_jobs_requeued", extra={"count": moved})
                last_requeue = now
            try:
                did_work = process_one(worker_id)
            except Exception:
                # Gangguan jaringan/DB: tunggu sebentar lalu coba lagi, jangan matikan worker.
                log.exception("worker_loop_error")
                did_work = False
                time.sleep(2)
            if not did_work:
                time.sleep(settings.worker_poll_seconds)
    except KeyboardInterrupt:
        log.info("worker_stopped", extra={"worker_id": worker_id})


if __name__ == "__main__":
    main()
