"""Tes integrasi ke Supabase (project dari .env). Semua data uji dibersihkan setelah tes."""

import io

import pytest
from PIL import Image

from conftest import integration, make_image
from core.security import payload_hash
from services import jobs as job_service
from worker import process_one
from worker_handlers import JobOutcome

pytestmark = integration


def _generate(client, data: bytes, key: str | None, consent: str = "true"):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(
        "/lessons/generate",
        files={"file": ("foto.jpg", data, "image/jpeg")},
        data={"consent_ai_photo": consent},
        headers=headers,
    )


# ---------- sesi ----------

def test_session_lifecycle(client_factory):
    a = client_factory()
    sid = a.session_id
    assert a.get(f"/sessions/{sid}").status_code == 200

    res = a.patch(f"/sessions/{sid}", json={"canvas_size": "A3", "current_stage_order": 2})
    assert res.status_code == 200 and res.json()["canvas_size"] == "A3"

    assert a.patch(f"/sessions/{sid}", json={"token_hash": "x"}).status_code == 422
    assert a.patch(f"/sessions/{sid}", json={"palette_id": "00000000-0000-0000-0000-000000000000"}).status_code == 422

    assert a.delete(f"/sessions/{sid}").status_code == 204
    assert a.get(f"/sessions/{sid}").status_code == 401


def test_cookie_is_httponly(client_factory):
    from fastapi.testclient import TestClient

    from main import app

    res = TestClient(app).post("/sessions", json={})
    cookie = res.headers["set-cookie"].lower()
    assert "httponly" in cookie and "path=/" in cookie
    from core.supabase_client import get_supabase

    get_supabase().table("practice_sessions").delete().eq("id", res.json()["id"]).execute()


def test_cannot_access_other_session(client_factory):
    a, b = client_factory(), client_factory()
    assert b.get(f"/sessions/{a.session_id}").status_code == 404
    assert b.delete(f"/sessions/{a.session_id}").status_code == 404
    assert a.get(f"/sessions/{a.session_id}").status_code == 200


def test_missing_or_forged_cookie_rejected(client_factory):
    from fastapi.testclient import TestClient

    from main import app

    a = client_factory()
    res = TestClient(app).get(f"/sessions/{a.session_id}")
    assert res.status_code == 401 and res.json()["error"]["code"] == "session_required"
    forged = TestClient(app, cookies={"rerupa_session": "x" * 43})
    assert forged.get(f"/sessions/{a.session_id}").status_code == 401


def test_session_token_header_works_without_cookie():
    """Safari iOS memblokir cookie lintas situs: token dari POST /sessions dikirim ulang lewat header."""
    from fastapi.testclient import TestClient

    from main import app

    created = TestClient(app).post("/sessions", json={})
    assert created.status_code == 201
    token, sid = created.json()["session_token"], created.json()["id"]
    assert token
    no_cookie = TestClient(app)  # klien baru: tanpa cookie sama sekali
    assert no_cookie.get(f"/sessions/{sid}", headers={"X-Session-Token": token}).status_code == 200
    assert no_cookie.get(f"/sessions/{sid}", headers={"X-Session-Token": "x" * 43}).status_code == 401
    assert no_cookie.get(f"/sessions/{sid}", headers={"X-Session-Token": token}).json().get("session_token") is None  # hanya saat dibuat


# ---------- job ----------

def test_job_idempotency_and_conflict(client_factory):
    a = client_factory()
    h = payload_hash("x")
    j1, new1 = job_service.create_job(a.session_id, "generate_lesson", "key-test-0001", h)
    j2, new2 = job_service.create_job(a.session_id, "generate_lesson", "key-test-0001", h)
    assert new1 and not new2 and j1["id"] == j2["id"]
    with pytest.raises(Exception) as exc:
        job_service.create_job(a.session_id, "generate_lesson", "key-test-0001", payload_hash("beda"))
    assert getattr(exc.value, "code", "") == "idempotency_conflict"


def test_job_visible_only_to_owner(client_factory):
    a, b = client_factory(), client_factory()
    job, _ = job_service.create_job(a.session_id, "generate_lesson", "key-test-0002", payload_hash("y"))
    assert a.get(f"/jobs/{job['id']}").status_code == 200
    assert b.get(f"/jobs/{job['id']}").status_code == 404


def test_worker_success_and_crash(client_factory):
    a = client_factory()
    ok_job, _ = job_service.create_job(a.session_id, "generate_lesson", "key-test-0003", payload_hash("ok"))
    assert process_one("pytest-worker", {"generate_lesson": lambda job: JobOutcome("succeeded", result={"demo": True})}, a.session_id)
    body = a.get(f"/jobs/{ok_job['id']}").json()
    assert body["status"] == "succeeded" and body["is_final"] and body["result"] == {"demo": True}

    crash_job, _ = job_service.create_job(a.session_id, "generate_lesson", "key-test-0004", payload_hash("crash"))

    def boom(job):
        raise RuntimeError("detail internal")

    process_one("pytest-worker", {"generate_lesson": boom}, a.session_id)
    body = a.get(f"/jobs/{crash_job['id']}").json()
    assert body["status"] == "failed" and body["error_code"] == "internal_error"
    assert "detail internal" not in str(body)


def test_stale_job_requeued_then_failed(client_factory):
    a = client_factory()
    job, _ = job_service.create_job(a.session_id, "generate_lesson", "key-test-0005", payload_hash("stale"))
    assert job_service.claim_job("dead-worker-1", ["generate_lesson"], a.session_id)["id"] == job["id"]
    assert job_service.requeue_stale(0) >= 1
    again = job_service.claim_job("dead-worker-2", ["generate_lesson"], a.session_id)
    assert again["id"] == job["id"] and again["attempts"] == 2
    assert job_service.finish_job(job["id"], "dead-worker-1", "succeeded") is False  # worker lama tidak boleh menimpa
    job_service.requeue_stale(0)
    body = a.get(f"/jobs/{job['id']}").json()
    assert body["status"] == "failed" and body["error_code"] == "worker_timeout"


def test_deleting_session_cancels_queued_jobs(client_factory):
    a = client_factory()
    job, _ = job_service.create_job(a.session_id, "generate_lesson", "key-test-0006", payload_hash("del"))
    assert a.delete(f"/sessions/{a.session_id}").status_code == 204
    # Worker tidak boleh lagi mengambil job sesi yang dihapus.
    assert job_service.claim_job("pytest-worker", ["generate_lesson"], a.session_id) is None
    from core.supabase_client import get_supabase

    row = get_supabase().table("jobs").select("status, error_code").eq("id", job["id"]).execute().data[0]
    assert row == {"status": "failed", "error_code": "session_deleted"}


# ---------- unggahan + generate ----------

def test_generate_stores_clean_upload_and_is_idempotent(client_factory):
    from core.supabase_client import get_supabase

    a = client_factory()
    exif = Image.Exif()
    exif[0x8825] = {1: "S", 2: (6.0, 10.0, 0.0)}
    photo = make_image("JPEG", size=(120, 90), exif=exif)

    res = _generate(a, photo, "key-upload-0001")
    assert res.status_code == 202 and res.json()["status"] == "queued"
    job_id = res.json()["id"]

    assert _generate(a, photo, "key-upload-0001").json()["id"] == job_id
    assert _generate(a, make_image("PNG"), "key-upload-0001").json()["error"]["code"] == "idempotency_conflict"

    uploads = get_supabase().table("uploads").select("*").eq("session_id", a.session_id).execute().data
    assert len(uploads) == 1  # replay tidak menyimpan foto kedua
    stored = get_supabase().storage.from_("uploads").download(uploads[0]["raw_path"])
    assert len(Image.open(io.BytesIO(stored)).getexif()) == 0

    session = a.get(f"/sessions/{a.session_id}").json()
    assert session["consent"]["ai_photo"] is True


@pytest.mark.parametrize(
    "data,code",
    [
        (b"bukan gambar", "file_invalid"),
        (b"\xff\xd8\xff" + make_image("PNG"), "file_invalid"),
    ],
)
def test_generate_rejects_bad_files_without_storing(client_factory, data, code):
    from core.supabase_client import get_supabase

    a = client_factory()
    assert _generate(a, data, "key-bad-file-01").json()["error"]["code"] == code
    assert get_supabase().table("uploads").select("id").eq("session_id", a.session_id).execute().data == []


def test_generate_requires_key_and_session(client_factory):
    from fastapi.testclient import TestClient

    from main import app

    a = client_factory()
    assert _generate(a, make_image("PNG"), None).json()["error"]["code"] == "idempotency_key_required"
    assert _generate(TestClient(app), make_image("PNG"), "key-no-session-1").status_code == 401


def test_generate_quota(client_factory):
    a = client_factory()
    for i in range(3):
        assert _generate(a, make_image("PNG", color=(i, i, i)), f"key-quota-000{i}").status_code == 202
    res = _generate(a, make_image("PNG", color=(9, 9, 9)), "key-quota-0009")
    assert res.status_code == 429 and res.json()["error"]["code"] == "quota_exceeded"


def test_generate_job_with_plain_image_asks_for_retake(client_factory):
    # Sejak Fase 3 pipeline nyata berjalan: gambar polos (bukan karya) → minta foto ulang, tanpa lesson.
    a = client_factory()
    job_id = _generate(a, make_image("PNG"), "key-pipeline-01").json()["id"]
    while process_one("pytest-worker", session_id=a.session_id):
        pass
    body = a.get(f"/jobs/{job_id}").json()
    assert body["status"] == "needs_retake" and body["error_code"] in ("photo_unusable", "not_artwork")
    assert body["lesson_version_id"] is None


# ---------- galeri ----------

def test_artworks_only_published():
    from fastapi.testclient import TestClient

    from core.supabase_client import get_supabase
    from main import app

    db = get_supabase()
    published = db.table("artworks").insert(
        {"slug": "pytest-terbit", "title": "Uji", "image_path": "x.jpg", "thumbnail_path": "x.jpg", "license": "cc0", "status": "published"}
    ).execute().data[0]
    draft = db.table("artworks").insert(
        {"slug": "pytest-draf", "title": "Draf", "image_path": "x.jpg", "thumbnail_path": "x.jpg"}
    ).execute().data[0]
    try:
        c = TestClient(app)
        slugs = [a["slug"] for a in c.get("/artworks").json()]
        assert "pytest-terbit" in slugs and "pytest-draf" not in slugs
        assert c.get("/artworks/pytest-draf").status_code == 404
    finally:
        db.table("artworks").delete().in_("id", [published["id"], draft["id"]]).execute()


def test_deleting_session_removes_photo_files(client_factory):
    from core.supabase_client import get_supabase

    a = client_factory()
    assert _generate(a, make_image("JPEG"), "key-purge-0001").status_code == 202
    db = get_supabase()
    path = db.table("uploads").select("raw_path").eq("session_id", a.session_id).execute().data[0]["raw_path"]
    assert a.delete(f"/sessions/{a.session_id}").status_code == 204

    row = db.table("uploads").select("raw_path, purged_at").eq("session_id", a.session_id).execute().data[0]
    assert row["raw_path"] is None and row["purged_at"] is not None
    folder = db.storage.from_("uploads").list(a.session_id)
    assert path.split("/")[-1] not in [f["name"] for f in folder]


def test_oversized_request_rejected_early(client_factory):
    a = client_factory()
    res = a.post(
        "/lessons/generate",
        content=b"x",
        headers={"Content-Length": str(20 * 1024 * 1024), "Idempotency-Key": "key-oversize-01", "Content-Type": "multipart/form-data; boundary=x"},
    )
    assert res.status_code == 413 and res.json()["error"]["code"] == "file_too_large"
