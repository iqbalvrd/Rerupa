"""Tes Fase 8: storyline (sumber kisah berlapis, validator, panel, endpoint, privasi, retensi).
OpenAI diganti respons tiruan — tidak ada biaya."""

import io
from types import SimpleNamespace

import pytest
from PIL import Image

from ai import openai_client as oc
from conftest import integration
from story import panels as pm
from story import sources
from story.schemas import Character, Identity, Panel, PanelCheck, SourcedClaim, Source, SourceSearch, Storyboard
from story.storyboard import find_errors, sanitize


def png(color=(120, 60, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), color).save(buf, "PNG")
    return buf.getvalue()


def jpeg(color=(200, 180, 150), size=(400, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


def board(n=4, narration="Sang tokoh berdiri tenang di tangga saat fajar.", regions=("r01",), crop_first=True) -> Storyboard:
    return Storyboard(
        title="Kisah uji",
        summary="Ringkas.",
        style_guide="Cat minyak romantik, palet hangat.",
        characters=[Character(code="c1", name="Tokoh", description="Sorban hijau, jubah putih", region_codes=list(regions))],
        panels=[Panel(order_no=i, narration=narration, scene="Tokoh di tangga.", character_codes=["c1"], focus_region_codes=list(regions), use_artwork_crop=crop_first and i == 1) for i in range(1, n + 1)],
    )


# ---------------------------------------------------------------- sumber

def test_url_normalization_matches_search_results():
    assert sources.norm_url("https://www.Example.org/a/b/?hl=en#x") == sources.norm_url("http://example.org/a/b")
    out = SourceSearch(found=True, claims=[SourcedClaim(text="X.", type="fakta", source_urls=["https://artsandculture.google.com/story/2AU?hl=en"])], sources=[])
    claims, _ = sources.validate_sources(out, ["https://artsandculture.google.com/story/2AU"])
    assert claims[0]["type"] == "fakta"


def test_trusted_domains_and_clean_text():
    assert sources.trusted("https://id.wikipedia.org/wiki/Raden_Saleh")
    assert sources.trusted("https://setkab.go.id/x") and sources.trusted("https://www.nationalgallery.sg/a")
    assert not sources.trusted("https://blogku.blogspot.com/x") and not sources.trusted("https://notwikipedia.org.evil.com")
    assert sources.clean_text("Dilukis 1857. ([setkab.go.id](https://setkab.go.id/x))") == "Dilukis 1857."


def test_fact_needs_cited_and_trusted_url():
    out = SourceSearch(found=True, claims=[
        SourcedClaim(text="A dibuat 1857.", type="fakta", source_urls=["https://id.wikipedia.org/wiki/A"]),
        SourcedClaim(text="B dari blog.", type="fakta", source_urls=["https://blog.example.com/b"]),
        SourcedClaim(text="C tidak dikutip.", type="fakta", source_urls=["https://id.wikipedia.org/wiki/C"]),
    ], sources=[Source(url="https://id.wikipedia.org/wiki/A", title="A")])
    claims, srcs = sources.validate_sources(out, ["https://id.wikipedia.org/wiki/A", "https://blog.example.com/b"])
    assert [c["type"] for c in claims] == ["fakta", "perkiraan", "perkiraan"]
    assert srcs == [{"url": "https://id.wikipedia.org/wiki/A", "title": "A", "domain": "id.wikipedia.org"}]


# ---------------------------------------------------------------- storyboard

def test_storyboard_validator_rules():
    assert find_errors(board(), {"r01"}, []) == []
    assert any("jumlah panel" in e for e in find_errors(board(n=3), {"r01"}, []))
    assert any("kata" in e for e in find_errors(board(narration="kata " * 41), {"r01"}, []))
    assert any("region tidak ada" in e for e in find_errors(board(regions=("r99",)), {"r01"}, []))
    restricted = board().model_copy(update={"characters": [Character(code="c1", name="Nabi Muhammad", description="x", region_codes=[])]})
    assert any("daftar terbatas" in e for e in find_errors(restricted, {"r01"}, ["Nabi Muhammad"]))


def test_storyboard_sanitize_trims_safely():
    fixed = sanitize(board(n=7, narration="kata " * 60, regions=("r01", "r99")), {"r01"})
    assert len(fixed.panels) == 6 and all(len(p.narration.split()) == 40 for p in fixed.panels)
    assert fixed.characters[0].region_codes == ["r01"] and find_errors(fixed, {"r01"}, []) == []


# ---------------------------------------------------------------- panel

def _panel_env(monkeypatch, checks):
    calls = {"img": 0}
    monkeypatch.setattr(oc, "ensure_available", lambda: None)

    def edit_image(**kw):
        calls["img"] += 1
        calls.setdefault("prompts", []).append(kw["prompt"])
        return png()

    monkeypatch.setattr(oc, "edit_image", edit_image)
    it = iter(checks)
    monkeypatch.setattr(oc, "parse", lambda **kw: SimpleNamespace(parsed=next(it)))
    return calls


def test_artwork_crop_panel_uses_original_without_ai(monkeypatch):
    calls = _panel_env(monkeypatch, [])
    sb = board()
    res = pm.make_panel(sb, sb.panels[0], original_jpeg=jpeg(), region_bbox={"r01": [50, 40, 100, 120]}, previous_png=None, image_model="m", quality="medium", safety_id="s", job_id=None)
    assert (res.kind, res.status) == ("artwork_crop", "ready") and res.jpeg and calls["img"] == 0


def test_inconsistent_panel_regenerated_once_then_text(monkeypatch):
    calls = _panel_env(monkeypatch, [PanelCheck(consistent=False, issues=["ada keris"]), PanelCheck(consistent=False, issues=["masih ada keris"])])
    sb = board()
    res = pm.make_panel(sb, sb.panels[1], original_jpeg=jpeg(), region_bbox={}, previous_png=None, image_model="m", quality="medium", safety_id="s", job_id=None)
    assert calls["img"] == 2 and "ada keris" in calls["prompts"][1]
    assert (res.kind, res.status) == ("text", "text_only")


def test_consistent_panel_ready_and_refusal_falls_back(monkeypatch):
    _panel_env(monkeypatch, [PanelCheck(consistent=True, issues=[])])
    sb = board()
    res = pm.make_panel(sb, sb.panels[1], original_jpeg=jpeg(), region_bbox={}, previous_png=None, image_model="m", quality="medium", safety_id="s", job_id=None)
    assert (res.kind, res.status) == ("generated", "ready") and res.jpeg[:2] == b"\xff\xd8"

    def refuse(**kw):
        raise oc.AIUnavailable("ai_refused")

    monkeypatch.setattr(oc, "edit_image", refuse)
    res = pm.make_panel(sb, sb.panels[1], original_jpeg=jpeg(), region_bbox={}, previous_png=None, image_model="m", quality="medium", safety_id="s", job_id=None)
    assert (res.kind, res.status) == ("text", "text_only")


# ---------------------------------------------------------------- dasar kisah (tanpa DB)

def test_research_confidence_scoring():
    rc = sources.research_confidence
    assert rc("high", True, 2) == "high"  # dikenali + diverifikasi sumber
    assert rc("high", False, 0) == "medium"  # dikenali, belum ada sumber
    assert rc("medium", True, 1) == "medium"
    assert rc("low", True, 1) == "low"  # tebakan lemah tidak diselamatkan satu sumber
    assert rc(None, True, 2, from_user=True) == "high"
    assert rc(None, False, 0, from_user=True) == "low"


FACT = ([{"text": "Dilukis 1857.", "type": "fakta", "source_urls": ["https://id.wikipedia.org/x"], "source_codes": []},
         {"text": "Koleksi negara.", "type": "fakta", "source_urls": ["https://id.wikipedia.org/x"], "source_codes": []}],
        [{"url": "https://id.wikipedia.org/x", "title": "x", "domain": "id.wikipedia.org"}])
NO_FACT = ([{"text": "Mungkin abad 19.", "type": "perkiraan", "source_urls": [], "source_codes": []}], [])


def _identify(conf: str, identified: bool = True):
    return lambda *a, **k: Identity(identified=identified, title="Penangkapan Pangeran Diponegoro", artist="Raden Saleh", origin="Jawa", confidence=conf, reason="ciri")


def test_decide_basis_paths(monkeypatch):
    from story import service

    lesson = {"origin": "free_mode", "original_jpeg": jpeg(), "id": "x"}
    assert service.decide_basis(lesson, {"interpretation_only": True}, safety_id="s", job_id=None)[0] == "ai_interpretation"
    # Tanpa izin foto & tanpa isian: tidak ada yang bisa diriset → interpretasi, tanpa bertanya.
    assert service.decide_basis(lesson, {}, safety_id="s", job_id=None)[0] == "ai_interpretation"

    # Foto dikenali + diverifikasi sumber → bersumber, keyakinan tinggi, tanpa konfirmasi pengguna.
    monkeypatch.setattr(sources, "identify", _identify("high"))
    monkeypatch.setattr(sources, "search", lambda *a, **k: FACT)
    basis, identity, claims, srcs = service.decide_basis(lesson, {"consent_ai_photo": True}, safety_id="s", job_id=None)
    assert basis == "sourced" and identity["artist"] == "Raden Saleh" and identity["confidence"] == "high"
    assert identity["source"] == "ai_research" and identity["confirmed_by_user"] is False and srcs

    # Dikenali tetapi sumber tidak ketemu → dugaan (medium), klaim web tidak dipakai sebagai fakta.
    monkeypatch.setattr(sources, "search", lambda *a, **k: NO_FACT)
    basis, identity, claims, srcs = service.decide_basis(lesson, {"consent_ai_photo": True}, safety_id="s", job_id=None)
    assert basis == "ai_interpretation" and identity["confidence"] == "medium" and not srcs
    assert all(c["type"] == "perkiraan" for c in claims)

    # Tebakan lemah → nama karya tidak dipakai sama sekali.
    monkeypatch.setattr(sources, "identify", _identify("low"))
    basis, identity, claims, _ = service.decide_basis(lesson, {"consent_ai_photo": True}, safety_id="s", job_id=None)
    assert basis == "ai_interpretation" and "artist" not in identity and claims == []

    # Isian pengguna tetap jalur sumber.
    monkeypatch.setattr(sources, "search", lambda *a, **k: FACT)
    basis, identity, _, _ = service.decide_basis(lesson, {"title_hint": "Penangkapan Pangeran Diponegoro"}, safety_id="s", job_id=None)
    assert basis == "sourced" and identity["confirmed_by_user"] is True
    monkeypatch.setattr(sources, "search", lambda *a, **k: NO_FACT)
    assert service.decide_basis(lesson, {"artist_hint": "X"}, safety_id="s", job_id=None)[0] == "user_hint"


def test_basis_note_mentions_research_confidence():
    from routes.stories import basis_note

    ident = {"title": "Karya Uji", "artist": "Pelukis Uji", "source": "ai_research", "confidence": "high"}
    assert "keyakinan tinggi" in basis_note("sourced", ident)
    assert "dugaan" not in basis_note("sourced", ident) and "menduga" in basis_note("ai_interpretation", {**ident, "confidence": "medium"})
    assert basis_note("user_hint", {"source": "user"}).startswith("Kisah disusun dari judul")


# ---------------------------------------------------------------- integrasi (DB, OpenAI tiruan)

@pytest.fixture
def story_ai(monkeypatch):
    from core.config import get_settings

    monkeypatch.setattr(get_settings(), "feature_story", True)
    monkeypatch.setattr(oc, "ensure_available", lambda: None)
    monkeypatch.setattr(oc, "edit_image", lambda **kw: png((40, 90, 60)))

    def fake_parse(**kw):
        task = kw["task"]
        if task == "story_sources":
            out = SourceSearch(found=True, claims=[SourcedClaim(text="Karya ini dilukis pada 1857.", type="fakta", source_urls=["https://id.wikipedia.org/wiki/Uji"])], sources=[Source(url="https://id.wikipedia.org/wiki/Uji", title="Uji")])
            return SimpleNamespace(parsed=out, citations=["https://id.wikipedia.org/wiki/Uji"])
        if task == "story_identify":
            return SimpleNamespace(parsed=Identity(identified=True, title="Karya Uji", artist="Pelukis Uji", origin="Jawa", confidence="high", reason="ciri"))
        if task == "storyboard":
            regions = __import__("json").loads(kw["content"][0]["text"].split("\n", 1)[1])["regions"]
            return SimpleNamespace(parsed=board(regions=(regions[0]["code"],)))
        if task == "panel_check":
            return SimpleNamespace(parsed=PanelCheck(consistent=True, issues=[]))
        raise AssertionError(task)

    monkeypatch.setattr(oc, "parse", fake_parse)


def _free_lesson(client_factory):
    from test_lessons import figure_jpeg, generate, run_job

    c = client_factory()
    job = generate(c, figure_jpeg(), "key-story-lesson1").json()
    run_job(c)
    c.lesson_id = c.get(f"/jobs/{job['id']}").json()["lesson_version_id"]
    return c


def _post_story(c, key, **body):
    return c.post(f"/lessons/{c.lesson_id}/story", json=body, headers={"Idempotency-Key": key})


@integration
def test_free_mode_story_with_hints_end_to_end(client_factory, story_ai):
    from test_lessons import fast_cv, run_job  # noqa: F401

    c = _free_lesson(client_factory)
    r = _post_story(c, "key-story-0001", title_hint="Karya Uji", artist_hint="Pelukis Uji")
    assert r.status_code == 202, r.text
    run_job(c)
    job = c.get(f"/jobs/{r.json()['job']['id']}").json()
    assert job["status"] == "succeeded" and job["result"]["kind"] == "story"
    s = c.get(f"/stories/{job['result']['story_id']}").json()
    assert s["status"] == "ready" and s["story_basis"] == "sourced" and s["basis_label"] == "Kisah bersumber"
    assert s["claims"][0]["type"] == "fakta" and s["sources"][0]["domain"] == "id.wikipedia.org"
    assert [p["image_label"] for p in s["panels"]] == ["Potongan karya asli"] + ["Ilustrasi AI"] * 3
    assert all(p["image_url"] for p in s["panels"])
    # Memanggil lagi → cerita yang sama, tanpa job baru
    again = _post_story(c, "key-story-0002", title_hint="lain")
    assert again.status_code == 200 and again.json()["story_id"] == s["id"]
    # Sesi lain tidak bisa membaca
    other = client_factory()
    assert other.get(f"/stories/{s['id']}").status_code == 404


@integration
def test_photo_without_hints_is_researched_not_asked(client_factory, story_ai):
    from test_lessons import fast_cv, run_job  # noqa: F401

    c = _free_lesson(client_factory)
    r = _post_story(c, "key-story-0003", consent_ai_photo=True)
    run_job(c)
    job = c.get(f"/jobs/{r.json()['job']['id']}").json()
    assert job["result"]["kind"] == "story"  # langsung jadi cerita, tanpa "Apakah ini …?"
    s = c.get(f"/stories/{job['result']['story_id']}").json()
    assert s["story_basis"] == "sourced" and s["identity"]["artist"] == "Pelukis Uji"
    assert s["identity"]["source"] == "ai_research" and s["identity"]["confidence"] in ("high", "medium")
    assert "keyakinan" in s["basis_note"]
    r = _post_story(c, "key-story-0004", interpretation_only=True)
    assert r.status_code == 200  # cerita sesi ini sudah ada → dipakai lagi


@integration
def test_feature_flag_and_collection_rules(client_factory, story_ai, monkeypatch):
    from core.config import get_settings
    from core.supabase_client import get_supabase

    c = client_factory()
    db = get_supabase()
    lv = db.table("lesson_versions").select("id, status").eq("origin", "collection").limit(1).execute().data
    if not lv:
        pytest.skip("belum ada materi koleksi")
    lid, old = lv[0]["id"], lv[0]["status"]
    c.lesson_id = lid
    assert _post_story(c, "key-story-0005").status_code == 404  # lesson draf
    db.table("lesson_versions").update({"status": "published"}).eq("id", lid).execute()
    try:
        r = _post_story(c, "key-story-0006")
        assert r.status_code == 404 and r.json()["error"]["code"] == "story_not_available"
        monkeypatch.setattr(get_settings(), "feature_story", False)
        assert _post_story(c, "key-story-0007").json()["error"]["code"] == "feature_disabled"
    finally:
        db.table("lesson_versions").update({"status": old}).eq("id", lid).execute()


@integration
def test_story_panels_purged_after_24h(client_factory, story_ai):
    from datetime import timedelta

    from core.session import now_utc
    from core.supabase_client import get_supabase
    from services import retention
    from test_lessons import fast_cv, run_job  # noqa: F401

    c = _free_lesson(client_factory)
    r = _post_story(c, "key-story-0008", interpretation_only=True)
    run_job(c)
    sid = c.get(f"/jobs/{r.json()['job']['id']}").json()["result"]["story_id"]
    get_supabase().table("uploads").update({"expires_at": (now_utc() - timedelta(hours=25)).isoformat()}).eq("session_id", c.session_id).execute()
    assert retention.purge_expired_story_panels() >= 4
    s = c.get(f"/stories/{sid}").json()
    assert all(p["purged"] and p["image_url"] is None for p in s["panels"]) and s["panels"][0]["narration"]
