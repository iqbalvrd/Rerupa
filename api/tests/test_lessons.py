"""Tes integrasi alur tutorial (Supabase + pipeline CV + worker). Model CV harus sudah ada di cache.

Memakai lineart xdog + tanpa mask agar cepat dan tidak bergantung unduhan model; jalur model
diuji di tests/test_cv.py dan di eval/.
"""

import json

import pytest

from conftest import integration, make_image
from core.supabase_client import get_supabase
from worker import process_one

pytestmark = integration


@pytest.fixture(autouse=True)
def fast_cv(monkeypatch):
    from types import SimpleNamespace

    import worker_handlers
    from core.config import get_settings

    real = get_settings()
    fake = SimpleNamespace(**{**real.model_dump(), "lineart_method": "xdog", "mask_model": None})
    monkeypatch.setattr(worker_handlers, "get_settings", lambda: fake)


def figure_jpeg() -> bytes:
    import io
    import sys

    sys.path.insert(0, "tests")
    from PIL import Image
    from test_cv import figure_image

    buf = io.BytesIO()
    Image.fromarray(figure_image()).save(buf, "JPEG", quality=92)
    return buf.getvalue()


def generate(client, data: bytes, key: str, consent="false", scope=None):
    form = {"consent_ai_photo": consent}
    if scope is not None:
        form["scope"] = json.dumps(scope)
    return client.post("/lessons/generate", files={"file": ("f.jpg", data, "image/jpeg")}, data=form, headers={"Idempotency-Key": key})


def run_job(client):
    while process_one("pytest-worker", session_id=client.session_id):
        pass


def test_free_mode_lesson_end_to_end(client_factory):
    import httpx

    a = client_factory()
    job_id = generate(a, figure_jpeg(), "key-lesson-0001").json()["id"]
    run_job(a)
    job = a.get(f"/jobs/{job_id}").json()
    assert job["status"] == "succeeded", job
    assert job["result"]["text_source"] == "template" and job["result"]["notes"] == ["ai_not_allowed"]

    lesson = a.get(f"/lessons/{job['lesson_version_id']}")
    assert lesson.status_code == 200
    L = lesson.json()
    assert L["generated_automatically"] and L["origin"] == "free_mode"
    assert (L["image_width"], L["image_height"]) == (900, 1200)
    assert 6 <= len(L["stages"]) <= 8 and L["stages"][1]["is_checkpoint"]
    opened = [c for s in L["stages"] for c in s["new_region_codes"]]
    assert sorted(opened) == sorted(r["code"] for r in L["regions"])  # tiap region tepat sekali
    kinds = {l["kind"] for l in L["layers"]}
    assert {"grid", "sketch", "regions", "lineart", "original_photo"} <= kinds
    regions_svg = httpx.get(next(l["url"] for l in L["layers"] if l["kind"] == "regions"))
    assert regions_svg.status_code == 200 and 'id="r01"' in regions_svg.text

    assert a.get(f"/sessions/{a.session_id}").json()["lesson_version_id"] == job["lesson_version_id"]


def test_free_mode_lesson_private_to_owner(client_factory):
    from fastapi.testclient import TestClient

    from main import app

    a, b = client_factory(), client_factory()
    job_id = generate(a, figure_jpeg(), "key-lesson-0002").json()["id"]
    run_job(a)
    lesson_id = a.get(f"/jobs/{job_id}").json()["lesson_version_id"]
    assert b.get(f"/lessons/{lesson_id}").status_code == 404
    assert TestClient(app).get(f"/lessons/{lesson_id}").status_code == 404
    assert a.get("/lessons/00000000-0000-0000-0000-000000000000").status_code == 404


def test_scope_crops_the_photo(client_factory):
    a = client_factory()
    job_id = generate(a, figure_jpeg(), "key-lesson-0003", scope={"x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5}).json()["id"]
    run_job(a)
    L = a.get(f"/lessons/{a.get(f'/jobs/{job_id}').json()['lesson_version_id']}").json()
    assert (L["image_width"], L["image_height"]) == (450, 600)


@pytest.mark.parametrize("scope", ['{"x": 0.9, "y": 0, "w": 0.5, "h": 0.5}', "bukan json", '{"x": 0, "y": 0, "w": 0.01, "h": 0.5}'])
def test_invalid_scope_rejected(client_factory, scope):
    a = client_factory()
    res = a.post("/lessons/generate", files={"file": ("f.jpg", figure_jpeg(), "image/jpeg")},
                 data={"consent_ai_photo": "false", "scope": scope}, headers={"Idempotency-Key": "key-bad-scope-1"})
    assert res.status_code == 422


def test_unusable_photo_needs_retake(client_factory):
    import cv2
    import numpy as np

    a = client_factory()
    dark = np.full((800, 600, 3), 12, np.uint8)
    ok, buf = cv2.imencode(".jpg", dark)
    job_id = generate(a, buf.tobytes(), "key-dark-0001").json()["id"]
    run_job(a)
    job = a.get(f"/jobs/{job_id}").json()
    assert job["status"] == "needs_retake" and job["error_code"] in ("photo_unusable", "not_artwork")
    assert job["lesson_version_id"] is None


def test_deleting_session_removes_lesson_files(client_factory):
    a = client_factory()
    generate(a, figure_jpeg(), "key-lesson-0004")
    run_job(a)
    db = get_supabase()
    assert db.storage.from_("derived").list(a.session_id)
    assert a.delete(f"/sessions/{a.session_id}").status_code == 204
    assert db.storage.from_("derived").list(a.session_id) == []


def test_create_lesson_is_atomic():
    """Payload dengan klaim fakta tanpa sumber harus gagal TANPA meninggalkan lesson setengah jadi."""
    db = get_supabase()
    before = db.table("lesson_versions").select("id", count="exact").execute().count
    art = db.table("artworks").insert({"slug": "pytest-atomik", "title": "x", "image_path": "x", "thumbnail_path": "x"}).execute().data[0]
    payload = {
        "lesson": {"artwork_id": art["id"], "origin": "collection", "image_width": 10, "image_height": 10, "use_shading": False,
                   "lineart_method": "xdog", "checkpoint_count": 1, "ai_text_status": "template", "status": "draft"},
        "regions": [{"code": "r01", "hex": "#FFFFFF", "lab": [100, 0, 0], "area_pct": 100, "bbox": [0, 0, 10, 10], "centroid": [5, 5],
                     "is_main_object": False, "is_background": True, "value_level": None, "neighbors": [], "label": None}],
        "layers": [],
        "stages": [{"code": "stage_1", "order_no": 1, "kind": "preparation", "layers": ["grid"], "is_checkpoint": False, "title": "t",
                    "action": "a", "tools": [], "done_when": "d", "common_mistakes": [], "focus_bbox": None, "text_source": "template",
                    "region_codes": ["r01"]}],
        "claims": [{"text": "fakta palsu", "type": "fakta", "source_codes": ["tidak-ada"], "stage_code": None}],
        "reflection": None,
        "session_id": None,
    }
    try:
        with pytest.raises(Exception):
            db.rpc("create_lesson", {"p": payload}).execute()
        assert db.table("lesson_versions").select("id", count="exact").execute().count == before
    finally:
        db.table("artworks").delete().eq("id", art["id"]).execute()


def test_draft_collection_lesson_is_hidden_until_published():
    from fastapi.testclient import TestClient

    from main import app

    db = get_supabase()
    art = db.table("artworks").insert({"slug": "pytest-koleksi", "title": "Uji", "image_path": "x", "thumbnail_path": "x", "license": "cc0"}).execute().data[0]
    payload = {
        "lesson": {"artwork_id": art["id"], "origin": "collection", "image_width": 10, "image_height": 10, "use_shading": False,
                   "lineart_method": "xdog", "checkpoint_count": 1, "ai_text_status": "curated", "status": "draft"},
        "regions": [{"code": "r01", "hex": "#FFFFFF", "lab": [100, 0, 0], "area_pct": 100, "bbox": [0, 0, 10, 10], "centroid": [5, 5],
                     "is_main_object": False, "is_background": True, "value_level": None, "neighbors": [], "label": None}],
        "layers": [],
        "stages": [{"code": "stage_1", "order_no": 1, "kind": "preparation", "layers": ["grid"], "is_checkpoint": False, "title": "t",
                    "action": "a", "tools": [], "done_when": "d", "common_mistakes": [], "focus_bbox": None, "text_source": "curated",
                    "region_codes": ["r01"]}],
        "claims": [], "reflection": None, "session_id": None,
    }
    lesson_id = db.rpc("create_lesson", {"p": payload}).execute().data
    try:
        c = TestClient(app)
        assert c.get(f"/lessons/{lesson_id}").status_code == 404
        db.table("lesson_versions").update({"status": "published"}).eq("id", lesson_id).execute()
        assert c.get(f"/lessons/{lesson_id}").status_code == 200
    finally:
        db.table("artworks").delete().eq("id", art["id"]).execute()


# ---------- Fase 4: palet, warna, cache ----------

def test_palettes_lists_demo_palette():
    from fastapi.testclient import TestClient

    from main import app

    palettes = TestClient(app).get("/palettes").json()
    assert palettes and all(p["paints"] for p in palettes)
    assert any(paint["code"] == "titanium_white" for paint in palettes[0]["paints"])


def test_lesson_has_color_suggestion_for_every_region(client_factory):
    a = client_factory()
    job_id = generate(a, figure_jpeg(), "key-color-0001").json()["id"]
    run_job(a)
    L = a.get(f"/lessons/{a.get(f'/jobs/{job_id}').json()['lesson_version_id']}").json()
    assert L["palette_id"] is not None
    codes = {r["code"] for r in L["regions"]}
    assert {c["region_code"] for c in L["region_colors"]} == codes
    for c in L["region_colors"]:
        assert c["reachability"] in ("estimate", "hard", "recipe") and c["label"]
        assert c["components"] and c["explanation"]
        assert all(comp["parts"] >= 1 for comp in c["components"])
    # Latar krem gambar uji harus bisa didekati palet referensi.
    background = next(c for c in L["region_colors"] if c["region_code"] == "r01")
    assert background["reachability"] == "estimate" and background["delta_e"] <= 8


def test_unknown_palette_returns_no_colors(client_factory):
    a = client_factory()
    job_id = generate(a, figure_jpeg(), "key-color-0002").json()["id"]
    run_job(a)
    lesson_id = a.get(f"/jobs/{job_id}").json()["lesson_version_id"]
    L = a.get(f"/lessons/{lesson_id}", params={"palette_id": "00000000-0000-0000-0000-000000000000"}).json()
    assert L["region_colors"] == []


def test_same_photo_same_scope_reuses_lesson(client_factory):
    a = client_factory()
    photo = figure_jpeg()
    first = generate(a, photo, "key-cache-0001").json()["id"]
    run_job(a)
    second = generate(a, photo, "key-cache-0002").json()["id"]  # kunci beda, foto sama
    run_job(a)
    j1, j2 = a.get(f"/jobs/{first}").json(), a.get(f"/jobs/{second}").json()
    assert j2["status"] == "succeeded" and j2["result"] == {"cached": True}
    assert j2["lesson_version_id"] == j1["lesson_version_id"]

    third = generate(a, photo, "key-cache-0003", scope={"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8}).json()["id"]
    run_job(a)
    j3 = a.get(f"/jobs/{third}").json()
    assert j3["lesson_version_id"] != j1["lesson_version_id"]  # cakupan beda → diproses ulang


def test_recipe_endpoint(client_factory):
    from fastapi.testclient import TestClient

    from color.mixer import hex_to_lab
    from main import app

    db = get_supabase()
    palette = TestClient(app).get("/palettes").json()[0]
    paints = {p["code"]: p["id"] for p in palette["paints"]}
    rec = db.table("color_recipes").insert({
        "palette_id": palette["id"], "target_hex": "#B5532E", "target_lab": [round(float(v), 2) for v in hex_to_lab("#B5532E")],
        "components": [{"paint_id": paints["cadmium_red"], "parts": 2}, {"paint_id": paints["burnt_sienna"], "parts": 3}],
        "delta_e": 1.6, "kind": "estimated", "method": "mixbox_v2",
    }).execute().data[0]
    try:
        c = TestClient(app)
        body = c.get(f"/recipes/{rec['id']}").json()
        assert body["label"] == "Perkiraan, uji sedikit dulu"
        assert [x["paint_code"] for x in body["components"]] == ["burnt_sienna", "cadmium_red"]
        assert c.get("/recipes/00000000-0000-0000-0000-000000000000").status_code == 404
    finally:
        db.table("color_recipes").delete().eq("id", rec["id"]).execute()
