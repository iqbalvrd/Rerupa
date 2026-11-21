"""Tes integrasi Fase 5: progres tahap, checkpoint foto progres end-to-end (API + worker + Supabase), event."""

import json

import pytest

import checkpoint_synth as S
from conftest import integration
from core.supabase_client import get_supabase
from cv.normalize import encode_jpeg
from test_lessons import fast_cv, figure_jpeg, generate, run_job  # noqa: F401  (fixture fast_cv dipakai otomatis)

pytestmark = integration


@pytest.fixture
def lesson_client(client_factory):
    """Klien dengan tutorial mode bebas yang sudah jadi dan terpasang di sesi."""
    c = client_factory()
    job = generate(c, figure_jpeg(), "key-cp-lesson-01").json()
    run_job(c)
    lid = c.get(f"/jobs/{job['id']}").json()["lesson_version_id"]
    c.lesson = c.get(f"/lessons/{lid}").json()
    return c


def checkpoint_stage(lesson):
    return next(s for s in lesson["stages"] if s["is_checkpoint"])


def sketch_photo(client, shift=(0, 0), draw_lines=True):
    import httpx

    lesson = client.lesson
    sketch = next(l for l in lesson["layers"] if l["kind"] == "sketch")
    grid = next(l for l in lesson["layers"] if l["kind"] == "grid")["meta"]
    svg = S.fetch_text(sketch["url"])
    paper = S.drawing_from_svg(svg, lesson["image_width"], lesson["image_height"], (grid["cols"], grid["rows"]), shift=shift, draw_lines=draw_lines)
    photo, corners = S.photograph_any(paper)
    return encode_jpeg(photo, 92), corners


def post_checkpoint(client, data, corners, key, stage_code=None, consent="false"):
    return client.post(
        f"/sessions/{client.session_id}/checkpoints",
        files={"file": ("p.jpg", data, "image/jpeg")},
        data={"stage_code": stage_code or checkpoint_stage(client.lesson)["code"], "corners": json.dumps(corners), "consent_ai_photo": consent},
        headers={"Idempotency-Key": key},
    )


# ---------------------------------------------------------------- progres

def test_progress_viewed_is_not_completed(lesson_client):
    c = lesson_client
    stages = c.lesson["stages"]
    r = c.patch(f"/sessions/{c.session_id}/progress", json={"stage_code": stages[0]["code"], "status": "viewed"})
    assert r.status_code == 200
    body = r.json()
    assert body["stages"][0]["status"] == "viewed" and body["completed_count"] == 0

    c.patch(f"/sessions/{c.session_id}/progress", json={"stage_code": stages[0]["code"], "status": "completed"})
    body = c.patch(f"/sessions/{c.session_id}/progress", json={"stage_code": stages[0]["code"], "status": "viewed"}).json()
    assert body["stages"][0]["status"] == "completed"  # melihat lagi tidak menurunkan status
    assert body["stages"][0]["completed_at"] is not None

    body = c.patch(f"/sessions/{c.session_id}/progress", json={"stage_code": stages[2]["code"], "status": "viewed"}).json()
    assert body["current_stage_order"] == stages[2]["order_no"]
    assert c.get(f"/sessions/{c.session_id}").json()["current_stage_order"] == stages[2]["order_no"]


def test_progress_requires_lesson_and_own_session(client_factory, lesson_client):
    empty = client_factory()
    r = empty.patch(f"/sessions/{empty.session_id}/progress", json={"stage_code": "stage_1", "status": "viewed"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_required"
    other = lesson_client
    assert empty.get(f"/sessions/{other.session_id}/progress").status_code == 404
    r = other.patch(f"/sessions/{other.session_id}/progress", json={"stage_code": "tidak_ada", "status": "viewed"})
    assert r.status_code == 404


def test_session_cannot_bind_foreign_free_mode_lesson(client_factory, lesson_client):
    intruder = client_factory()
    r = intruder.patch(f"/sessions/{intruder.session_id}", json={"lesson_version_id": lesson_client.lesson["id"]})
    assert r.status_code == 404


# ---------------------------------------------------------------- checkpoint

def test_checkpoint_correct_sketch_end_to_end(lesson_client):
    c = lesson_client
    data, corners = sketch_photo(c)
    r = post_checkpoint(c, data, corners, "key-cp-ok-0001")
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["type"] == "feedback"
    # Idempoten: kirim ulang → job sama
    assert post_checkpoint(c, data, corners, "key-cp-ok-0001").json()["id"] == job["id"]

    run_job(c)
    got = c.get(f"/jobs/{job['id']}").json()
    assert got["status"] == "succeeded", got
    fb = c.get(f"/sessions/{c.session_id}/checkpoints/{job['id']}").json()
    assert fb["needs_retake"] is False and fb["alignment"] == "confirmed"
    assert fb["summary"] and len(fb["suggestions"]) <= 2
    assert fb["text_source"] == "template" and fb["photo_url"]
    assert fb["stage_code"] == checkpoint_stage(c.lesson)["code"]

    listed = c.get(f"/sessions/{c.session_id}/checkpoints").json()
    assert [x["job_id"] for x in listed] == [job["id"]]
    prog = c.get(f"/sessions/{c.session_id}/progress").json()
    assert next(s for s in prog["stages"] if s["is_checkpoint"])["feedback_count"] == 1


def test_checkpoint_shifted_sketch_gets_suggestion_from_candidates(lesson_client):
    c = lesson_client
    w = c.lesson["image_width"]
    data, corners = sketch_photo(c, shift=(round(w * 0.08), 0))
    job = post_checkpoint(c, data, corners, "key-cp-shift-01").json()
    run_job(c)
    fb = c.get(f"/sessions/{c.session_id}/checkpoints/{job['id']}").json()
    assert fb["needs_retake"] is False and 1 <= len(fb["suggestions"]) <= 2
    row = get_supabase().table("feedback_results").select("candidates, suggestions").eq("job_id", job["id"]).execute().data[0]
    cand_codes = {x["region_code"] for x in row["candidates"]}
    assert {s["region_code"] for s in fb["suggestions"]} <= cand_codes
    assert all(s["bbox"] and len(s["bbox"]) == 4 for s in fb["suggestions"])
    assert any("kanan" in s["observation"] for s in fb["suggestions"])


def test_checkpoint_bad_corners_needs_retake(lesson_client):
    c = lesson_client
    data, _ = sketch_photo(c)
    job = post_checkpoint(c, data, [100, 100, 220, 100, 220, 190, 100, 190], "key-cp-bad-0001").json()
    run_job(c)
    got = c.get(f"/jobs/{job['id']}").json()
    assert got["status"] == "needs_retake" and got["error_code"] == "alignment_failed"
    fb = c.get(f"/sessions/{c.session_id}/checkpoints/{job['id']}").json()
    assert fb["suggestions"] == [] and fb["retake_message"]


def test_checkpoint_rejects_non_checkpoint_stage_and_bad_corners(lesson_client):
    c = lesson_client
    data, corners = sketch_photo(c)
    other = next(s for s in c.lesson["stages"] if not s["is_checkpoint"])
    r = post_checkpoint(c, data, corners, "key-cp-nostage1", stage_code=other["code"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_checkpoint"
    r = post_checkpoint(c, data, [1, 2, 3], "key-cp-corners1")
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = post_checkpoint(c, data, [0, 0, 99999, 0, 99999, 99999, 0, 99999], "key-cp-corners2")
    assert r.status_code == 422


def test_checkpoint_quota_one_retry_per_stage(lesson_client):
    c = lesson_client
    data, corners = sketch_photo(c)
    for i in range(2):
        assert post_checkpoint(c, data, corners, f"key-cp-quota-{i:03d}").status_code == 202
    r = post_checkpoint(c, data, corners, "key-cp-quota-999")
    assert r.status_code == 429 and r.json()["error"]["code"] == "checkpoint_quota_exceeded"


def test_checkpoint_is_private_to_session(client_factory, lesson_client):
    c = lesson_client
    data, corners = sketch_photo(c)
    job = post_checkpoint(c, data, corners, "key-cp-priv-001").json()
    other = client_factory()
    assert other.get(f"/sessions/{c.session_id}/checkpoints").status_code == 404
    assert other.get(f"/sessions/{other.session_id}/checkpoints/{job['id']}").status_code == 404


def test_deleting_session_removes_progress_photos(lesson_client):
    c = lesson_client
    data, corners = sketch_photo(c)
    job = post_checkpoint(c, data, corners, "key-cp-del-0001").json()
    run_job(c)
    up = get_supabase().table("uploads").select("raw_path, rectified_path").eq("session_id", c.session_id).eq("purpose", "progress").execute().data[0]
    assert up["rectified_path"]
    assert c.delete(f"/sessions/{c.session_id}").status_code == 204
    rows = get_supabase().table("uploads").select("raw_path, rectified_path, purged_at").eq("session_id", c.session_id).eq("purpose", "progress").execute().data
    assert rows[0]["raw_path"] is None and rows[0]["rectified_path"] is None and rows[0]["purged_at"]
    listed = get_supabase().storage.from_("uploads").list(c.session_id)
    assert not [f for f in listed if f["name"].endswith(".jpg")]
    assert job["id"]


def test_second_checkpoint_paint_stage_end_to_end(lesson_client):
    import httpx

    c = lesson_client
    cps = [s for s in c.lesson["stages"] if s["is_checkpoint"]]
    assert len(cps) == 2 and cps[0]["kind"] == "sketch"  # CHECKPOINT_COUNT=2 (showcase)
    second = cps[1]
    open_codes = {code for s in c.lesson["stages"] if s["order_no"] <= second["order_no"] for code in s["new_region_codes"]}
    regions_svg = S.fetch_text(next(l for l in c.lesson["layers"] if l["kind"] == "regions")["url"])
    opened = sorted((r for r in c.lesson["regions"] if r["code"] in open_codes and not r["is_background"]), key=lambda r: -r["area_pct"])
    skip = {opened[0]["code"]} if opened else set()
    paper = S.painting_from_svg(regions_svg, c.lesson["regions"], open_codes, c.lesson["image_width"], c.lesson["image_height"], skip=skip)
    photo, corners = S.photograph_any(paper)
    job = post_checkpoint(c, encode_jpeg(photo, 92), corners, "key-cp-paint-01", stage_code=second["code"]).json()
    run_job(c)
    fb = c.get(f"/sessions/{c.session_id}/checkpoints/{job['id']}").json()
    assert fb["status"] == "succeeded", fb
    assert fb["stage_code"] == second["code"] and fb["alignment"] == "confirmed"
    if skip:
        assert [s["region_code"] for s in fb["suggestions"]][:1] == list(skip)  # bidang terbesar yang sengaja belum dicat
        assert "terisi" in fb["suggestions"][0]["observation"]


# ---------------------------------------------------------------- event

def test_events_whitelist_and_no_raw_session_id(lesson_client):
    c = lesson_client
    assert c.post("/events", json={"name": "recipe_opened", "props": {"stage_order": 3, "free_text": "rahasia"}}).status_code == 204
    assert c.post("/events", json={"name": "stage_completed"}).status_code == 422  # hanya server
    assert c.post("/events", json={"name": "tidak_ada"}).status_code == 422
    rows = get_supabase().table("events").select("session_ref, props").eq("name", "recipe_opened").order("id", desc=True).limit(1).execute().data
    assert rows[0]["props"] == {"stage_order": 3}
    assert rows[0]["session_ref"] and c.session_id.replace("-", "") not in rows[0]["session_ref"]
