"""Worker Rerupa: mengambil job dari tabel `jobs` lalu menjalankannya.

Jalankan dari folder api/: uv run python worker.py
- Klaim atomik lewat RPC claim_job (FOR UPDATE SKIP LOCKED), aman untuk banyak worker.
- Job yang macet (worker mati) dikembalikan ke antrean oleh requeue_stale_jobs, maks 2 percobaan.
- Error tak terduga di handler → job failed/internal_error; detail hanya di log.
"""

import logging
import os
import signal
import socket
import threading
import time
import uuid

from core.config import get_settings
from core.logging_setup import setup_logging
from services import jobs as job_service
from worker_handlers import HANDLERS, Handler

log = logging.getLogger("rerupa.worker")

REQUEUE_EVERY_SECONDS = 10  # juga memeriksa batas tunggu job (45/60 s), jadi cukup sering


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


STOP = threading.Event()


def request_stop(signum=None, frame=None) -> None:
    """SIGTERM/SIGINT (mis. redeploy Railway): berhenti mengambil job baru, tetapi job yang sedang
    berjalan diselesaikan dulu. Atur waktu draining platform ≥ batas job (60 s)."""
    if not STOP.is_set():
        log.info("worker_stopping", extra={"signal": signum})
        STOP.set()


def job_loop(worker_id: str, stop: threading.Event) -> None:
    """Satu jalur pemroses. Saat antrean kosong, jeda polling naik bertahap (0,5 → 2 s) agar tidak
    membebani database; begitu ada job, kembali cepat."""
    settings = get_settings()
    idle = settings.worker_poll_seconds
    while not stop.is_set():
        try:
            did_work = process_one(worker_id)
        except Exception:
            # Gangguan jaringan/DB: tunggu sebentar lalu coba lagi, jangan matikan worker.
            log.exception("worker_loop_error")
            stop.wait(2)
            continue
        if did_work:
            idle = settings.worker_poll_seconds
        else:
            stop.wait(idle)
            idle = min(idle * 2, settings.worker_idle_max_seconds)


def maintenance_loop(stop: threading.Event) -> None:
    """Cadangan penyapu job (utamanya pg_cron `sweep_jobs` tiap 30 s) + retensi file tiap 15 menit."""
    settings = get_settings()
    last_retention = 0.0
    while not stop.is_set():
        try:
            moved = job_service.requeue_stale(settings.worker_stale_after_seconds)
            if moved:
                log.warning("stale_jobs_requeued", extra={"count": moved})
            overdue = job_service.fail_overdue(
                {"generate_lesson": settings.generate_deadline_seconds, "feedback": settings.feedback_deadline_seconds},
                settings.deadline_grace_seconds,
            )
            if overdue:
                log.warning("overdue_jobs_failed", extra={"count": overdue})
        except Exception:
            log.exception("sweep_failed")
        if time.monotonic() - last_retention > settings.retention_every_seconds:
            last_retention = time.monotonic()
            try:
                from services import retention

                retention.run()
            except Exception:
                log.exception("retention_failed")  # dicoba lagi di putaran berikutnya
        stop.wait(REQUEUE_EVERY_SECONDS)


def main() -> None:
    setup_logging()
    settings = get_settings()
    worker_id = make_worker_id()
    log.info("worker_started", extra={"worker_id": worker_id, "types": list(HANDLERS), "concurrency": settings.worker_concurrency})
    try:
        from cv.models import warm_up

        log.info("models_warmed", extra=warm_up(settings.lineart_method, settings.mask_model))
    except Exception:
        # Worker tetap jalan; pipeline punya cadangan XDoG bila model gagal dimuat.
        log.exception("model_warm_up_failed")

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    # Beberapa jalur: saat satu job menunggu OpenAI (±18 s, I/O), jalur lain memakai CPU untuk CV.
    threads = [threading.Thread(target=job_loop, args=(f"{worker_id}#{i}", STOP), name=f"job-{i}", daemon=True) for i in range(max(1, settings.worker_concurrency))]
    threads.append(threading.Thread(target=maintenance_loop, args=(STOP,), name="maintenance", daemon=True))
    for t in threads:
        t.start()
    while any(t.is_alive() for t in threads):
        for t in threads:
            t.join(timeout=1)  # timeout pendek: thread utama tetap bisa menerima sinyal
    log.info("worker_stopped", extra={"worker_id": worker_id})


if __name__ == "__main__":
    main()
