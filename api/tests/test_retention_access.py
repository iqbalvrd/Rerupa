"""Bukti otomatis untuk definisi selesai versi showcase (Rencana §8, PRD §17):
- akses antar-sesi selalu 404 (job, tutorial, foto, progres, checkpoint, sesi);
- hapus sesi → akses langsung ditolak;
- idempotensi tidak menggandakan job;
- retensi: foto & turunannya dihapus setelah 24 jam (teks tetap), sesi terhapus/kedaluwarsa dibersihkan.
"""

import json
from datetime import timedelta

import httpx
import pytest

import checkpoint_synth as S
from conftest import integration
from core.session import now_utc
from core.supabase_client import get_supabase
from cv.normalize import encode_jpeg
from services import retention
from test_lessons import fast_cv, figure_jpeg, generate, run_job  # noqa: F401

pytestmark = integration

PAST = lambda: (now_utc() - timedelta(hours=25)).isoformat()  # noqa: E731


@pytest.fixture
def owner(client_factory):
    """Sesi A: tutorial jadi + 1 checkpoint selesai."""
    c = client_factory()
    job = generate(c, figure_jpeg(), "key-ret-lesson-01").json()
    run_job(c)
    c.job_id = job["id"]
    c.lesson = c.get(f"/lessons/{c.get(f'/jobs/{job['id']}').json()['lesson_version_id']}").json()
    sketch = next(l for l in c.lesson["layers"] if l["kind"] == "sketch")
    grid = next(l for l in c.lesson["layers"] if l["kind"] == "grid")["meta"]
    paper = S.drawing_from_svg(S.fetch_text(sketch["url"]), c.lesson["image_width"], c.lesson["image_height"], (grid["cols"], grid["rows"]))
    photo, corners = S.photograph_any(paper)
    stage = next(s for s in c.lesson["stages"] if s["is_checkpoint"])
    cp = c.post(
        f"/sessions/{c.session_id}/checkpoints",
        files={"file": ("p.jpg", encode_jpeg(photo, 92), "image/jpeg")},
        data={"stage_code": stage["code"], "corners": json.dumps(corners)},
        headers={"Idempotency-Key": "key-ret-cp-0001"},
    ).json()
    run_job(c)
    c.cp_id = cp["id"]
    c.stage_code = stage["code"]
    return c


def _storage_names(bucket: str, prefix: str) -> list[str]:
    names = []
    for item in get_supabase().storage.from_(bucket).list(prefix):
        if item.get("id") is None:  # folder
            names += [f"{item['name']}/{x['name']}" for x in get_supabase().storage.from_(bucket).list(f"{prefix}/{item['name']}")]
        else:
            names.append(item["name"])
    return names


# ---------------------------------------------------------------- akses antar-sesi

def test_other_session_gets_404_everywhere(owner, client_factory):
    a, b = owner, client_factory()
    sid, lid = a.session_id, a.lesson["id"]
    checks = [
        b.get(f"/sessions/{sid}"),
        b.patch(f"/sessions/{sid}", json={"canvas_size": "A3"}),
        b.get(f"/jobs/{a.job_id}"),
        b.get(f"/jobs/{a.cp_id}"),
        b.get(f"/lessons/{lid}"),
        b.get(f"/sessions/{sid}/progress"),
        b.patch(f"/sessions/{sid}/progress", json={"stage_code": a.stage_code, "status": "completed"}),
        b.get(f"/sessions/{sid}/checkpoints"),
        b.get(f"/sessions/{sid}/checkpoints/{a.cp_id}"),
        b.get(f"/sessions/{b.session_id}/checkpoints/{a.cp_id}"),  # ID milik A lewat URL sesi B
        b.patch(f"/sessions/{b.session_id}", json={"lesson_version_id": lid}),  # memasang tutorial A
        b.delete(f"/sessions/{sid}"),
    ]
    assert [r.status_code for r in checks] == [404] * len(checks)
    # Tanpa cookie sama sekali: lesson mode bebas tetap 404, endpoint sesi 401
    anon = client_factory(with_session=False)
    assert anon.get(f"/lessons/{lid}").status_code == 404
    assert anon.get(f"/jobs/{a.job_id}").status_code == 401
    # Sesi A tetap utuh setelah semua percobaan B
    assert a.get(f"/sessions/{sid}").status_code == 200 and a.get(f"/lessons/{lid}").status_code == 200


def test_delete_session_revokes_access_immediately(owner):
    a = owner
    token = a.cookies.get("rerupa_session")
    assert a.delete(f"/sessions/{a.session_id}").status_code == 204
    # Pasang lagi token lama (meniru tab lain / cookie yang belum terhapus)
    a.cookies.set("rerupa_session", token)
    stale = a
    for r in (
        stale.get(f"/sessions/{a.session_id}"),
        stale.get(f"/jobs/{a.job_id}"),
        stale.get(f"/sessions/{a.session_id}/checkpoints"),
    ):
        assert r.status_code == 401
    assert stale.get(f"/lessons/{a.lesson['id']}").status_code == 404


def test_idempotency_never_duplicates_jobs(client_factory):
    c = client_factory()
    data = figure_jpeg()
    ids = {generate(c, data, "key-idem-same-01").json()["id"] for _ in range(3)}
    assert len(ids) == 1
    r = generate(c, data[:-10] + b"0123456789", "key-idem-same-01")
    assert r.status_code == 409 and r.json()["error"]["code"] == "idempotency_conflict"
    n = get_supabase().table("jobs").select("id", count="exact").eq("session_id", c.session_id).execute().count
    assert n == 1


# ---------------------------------------------------------------- retensi

def test_photos_and_derived_layers_purged_after_24h_text_kept(owner):
    a = owner
    db = get_supabase()
    db.table("uploads").update({"expires_at": PAST()}).eq("session_id", a.session_id).execute()
    before = _storage_names("uploads", a.session_id)
    assert any(n.endswith("_rectified.jpg") for n in before)

    assert retention.purge_expired_uploads() >= 2
    assert retention.purge_expired_lesson_layers() >= 4
    assert _storage_names("uploads", a.session_id) == []

    lesson = a.get(f"/lessons/{a.lesson['id']}").json()
    layers = {l["kind"]: l for l in lesson["layers"]}
    assert layers["grid"]["url"] and not layers["grid"]["purged"]  # grid tidak berasal dari foto
    for kind in ("original_photo", "lineart", "regions", "sketch"):
        assert layers[kind]["purged"] and layers[kind]["url"] is None
    left = _storage_names("derived", a.session_id)
    assert left and all(n.endswith("grid.svg") for n in left)
    # Teks tutorial, saran warna, dan teks feedback tetap ada (FR13)
    assert lesson["stages"][0]["title"] and lesson["region_colors"]
    fb = a.get(f"/sessions/{a.session_id}/checkpoints/{a.cp_id}").json()
    assert fb["summary"] and fb["photo_url"] is None
    # Putaran kedua tidak melakukan apa-apa lagi (idempoten)
    assert retention.purge_expired_lesson_layers() == 0
    assert a.get(f"/sessions/{a.session_id}/progress").status_code == 200


def test_deleted_and_expired_sessions_are_cleaned(owner, client_factory):
    a = owner
    db = get_supabase()
    a.delete(f"/sessions/{a.session_id}")
    other = client_factory()
    db.table("practice_sessions").update({"expires_at": PAST()}).eq("id", other.session_id).execute()
    assert other.get(f"/sessions/{other.session_id}").status_code == 401  # kedaluwarsa = ditolak

    assert retention.cleanup_sessions(limit=500) >= 2
    for sid in (a.session_id, other.session_id):
        assert not db.table("practice_sessions").select("id").eq("id", sid).execute().data
        assert not db.table("jobs").select("id").eq("session_id", sid).execute().data
        assert not db.table("feedback_results").select("job_id").eq("session_id", sid).execute().data
        assert _storage_names("uploads", sid) == [] and _storage_names("derived", sid) == []
    assert not db.table("lesson_versions").select("id").eq("id", a.lesson["id"]).execute().data


def test_pg_cron_retention_job_scheduled():
    rows = get_supabase().rpc("retention_db").execute().data
    assert set(rows) == {"events", "ai_usage"}
