"""Tes perbaikan latensi & bug (ANALISA_OPTIMASI.md): penyapu job pg_cron, SIGTERM worker, backoff,
worker multi-jalur, cache materi koleksi, impor malas API."""

import sys
import threading
import time
from datetime import timedelta

import pytest

from conftest import integration


# ---------------------------------------------------------------- worker (tanpa jaringan)

def test_job_loop_stops_after_current_job_and_backs_off(monkeypatch):
    import worker

    calls, sleeps = [], []
    stop = threading.Event()

    def fake_process(worker_id):
        calls.append(worker_id)
        if len(calls) == 1:
            stop.set()  # SIGTERM datang saat job pertama berjalan
            return True  # job tetap diselesaikan
        return False

    monkeypatch.setattr(worker, "process_one", fake_process)
    worker.job_loop("w#0", stop)
    assert calls == ["w#0"]  # tidak mengambil job baru setelah berhenti

    # Backoff: antrean kosong → jeda naik 0,5 → 1 → 2 → 2
    stop2 = threading.Event()
    monkeypatch.setattr(worker, "process_one", lambda w: False)
    orig_wait = stop2.wait

    def wait(t):
        sleeps.append(t)
        if len(sleeps) >= 4:
            stop2.set()
        return orig_wait(0)

    stop2.wait = wait
    worker.job_loop("w#1", stop2)
    assert sleeps == [0.5, 1.0, 2.0, 2.0]


def test_request_stop_sets_flag():
    import worker

    worker.STOP.clear()
    worker.request_stop(15)
    assert worker.STOP.is_set()
    worker.STOP.clear()


def test_api_does_not_import_cv_stack():
    import subprocess

    code = "import sys, main; print(sorted(m for m in ('torch','cv2','numpy','scipy','colour','mixbox','matplotlib') if m in sys.modules))"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=".").stdout.strip().splitlines()[-1]
    assert out == "[]"


# ---------------------------------------------------------------- database

@integration
def test_sweep_jobs_fails_overdue_without_worker(client_factory):
    """A1: job yang lewat batas digagalkan oleh fungsi DB (dipanggil pg_cron), tanpa worker."""
    from core.session import now_utc
    from core.supabase_client import get_supabase
    from services import jobs as job_service

    c = client_factory()
    db = get_supabase()
    old, _ = job_service.create_job(c.session_id, "feedback", "key-sweep-0001", "c" * 64)
    db.table("jobs").update({"created_at": (now_utc() - timedelta(seconds=90)).isoformat()}).eq("id", old["id"]).execute()
    fresh, _ = job_service.create_job(c.session_id, "feedback", "key-sweep-0002", "d" * 64)

    res = db.rpc("sweep_jobs").execute().data
    assert res["overdue"] >= 1
    assert c.get(f"/jobs/{old['id']}").json()["error_code"] == "worker_timeout"
    assert c.get(f"/jobs/{fresh['id']}").json()["status"] == "queued"
    jobs = db.rpc("expired_lesson_layers", {"p_limit": 5}).execute().data
    assert isinstance(jobs, list)


@integration
def test_two_worker_lanes_process_two_jobs_concurrently(client_factory, monkeypatch):
    """B3: dua jalur mengambil job berbeda (tidak pernah job yang sama)."""
    import worker
    from services import jobs as job_service

    c = client_factory()
    for i in range(2):
        job_service.create_job(c.session_id, "feedback", f"key-lane-{i:04d}", f"{i}" * 64)
    seen, lock = [], threading.Lock()
    barrier = threading.Barrier(2, timeout=20)

    def slow_handler(job):
        with lock:
            seen.append(job["id"])
        barrier.wait()  # keduanya harus berjalan BERSAMAAN agar lolos
        from worker_handlers import JobOutcome

        return JobOutcome("failed", error_code="internal_error")

    handlers = {"feedback": slow_handler}
    results = []
    threads = [threading.Thread(target=lambda n=n: results.append(worker.process_one(f"pytest-lane#{n}", handlers, c.session_id))) for n in range(2)]
    t0 = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert results == [True, True] and len(set(seen)) == 2
    assert time.monotonic() - t0 < 20


# ---------------------------------------------------------------- cache materi koleksi

@integration
def test_published_collection_lesson_is_cached_and_drafts_are_not(monkeypatch):
    from fastapi.testclient import TestClient

    from core.supabase_client import get_supabase
    from main import app
    from routes import lessons as lr

    db = get_supabase()
    rows = db.table("lesson_versions").select("id, status").eq("origin", "collection").limit(1).execute().data
    if not rows:
        pytest.skip("belum ada materi koleksi")
    lid = rows[0]["id"]
    lr.clear_lesson_cache()
    c = TestClient(app)
    assert c.get(f"/lessons/{lid}").status_code == 404  # draf → tidak terbuka, tidak di-cache
    assert not lr._CACHE

    db.table("lesson_versions").update({"status": "published"}).eq("id", lid).execute()
    try:
        t = time.perf_counter()
        first = c.get(f"/lessons/{lid}")
        cold = time.perf_counter() - t
        t = time.perf_counter()
        second = c.get(f"/lessons/{lid}")
        warm = time.perf_counter() - t
        assert first.status_code == second.status_code == 200 and first.json() == second.json()
        assert len(first.json()["region_colors"]) == len(first.json()["regions"]) > 0
        assert warm < cold  # dari cache, tanpa query
    finally:
        db.table("lesson_versions").update({"status": rows[0]["status"]}).eq("id", lid).execute()
        lr.clear_lesson_cache()


@integration
def test_parallel_uploads_do_not_break_shared_connection():
    """Regresi: dengan HTTP/2 bawaan supabase-py, 8 unggahan paralel menggagalkan ±70% permintaan
    (ConnectionTerminated / WriteError). Pool HTTP/1.1 di core/supabase_client.py: 0 gagal."""
    import os
    import uuid
    from concurrent.futures import ThreadPoolExecutor

    from core.supabase_client import get_supabase

    db = get_supabase()
    blob = os.urandom(400_000)
    prefix = f"pytest-parallel/{uuid.uuid4().hex}"
    errors, paths = [], []

    def put(i):
        p = f"{prefix}/{i}.jpg"
        try:
            db.storage.from_("uploads").upload(p, blob, {"content-type": "image/jpeg"})
            paths.append(p)
            db.table("palettes").select("id").limit(1).execute()
        except Exception as exc:  # noqa: BLE001
            errors.append(type(exc).__name__)

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(put, range(32)))
    if paths:
        db.storage.from_("uploads").remove(paths)
    assert errors == []
