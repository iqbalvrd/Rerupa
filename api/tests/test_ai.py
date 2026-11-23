"""Tes lapisan AI tanpa memanggil OpenAI sungguhan (panggilan dipalsukan)."""

import pytest

from ai import lesson_text
from ai import openai_client as oc
from ai.schemas import CultureClaim, LessonText, Reflection, RegionLabel, StageText, StyleAnalysis
from ai.templates import TEMPLATES, template_lesson_text
from ai.validators import find_errors, sanitize
from cv.stage_planner import plan_stages
from cv.types import CvResult, Quality, Region


def region(code, area, *, bg=False, main=False):
    return Region(code=code, hex="#808080", lab=[50.0, 0.0, 0.0], area_pct=area, bbox=[0, 0, 10, 10], centroid=[5, 5],
                  is_main_object=main, is_background=bg, neighbors=[], value_level=None, path_svg="M0 0 Z")


REGIONS = [region("r01", 80, bg=True), region("r02", 14, main=True), region("r03", 4), region("r04", 2)]
STAGES = plan_stages(REGIONS, use_shading=False)
CODES = {r.code for r in REGIONS}


def fake_cv(use_shading=False):
    return CvResult(
        width=900, height=1200, lineart_method="teed", mask_model="u2net", use_shading=use_shading, shading_hint=0.1,
        quality=Quality(True, 100, 120, 40, 0), regions=REGIONS, lineart_png=b"", regions_svg="", sketch_svg="",
        main_object_svg=None, value_svg=None, numbered_png=b"png", ai_image_jpeg=b"jpg", original_jpeg=b"",
    )


def good_output(**overrides) -> LessonText:
    data = dict(
        style=StyleAnalysis(technique="garis_bidang_datar", use_shading=False, reason="Garis tegas dan bidang datar."),
        skill_goal="Melatih garis tegas.",
        culture_goal="",
        stages=[StageText(stage_code=s.code, title=f"Judul {s.order_no}", action="Isi bidang yang menyala.", tools=["kuas bulat"],
                          done_when="Bidang terisi rata.", common_mistakes=["Cat melewati garis."]) for s in STAGES],
        region_labels=[RegionLabel(region_code="r02", label="jubah merah tokoh")],
        culture_claims=[CultureClaim(text="Gayanya mirip lukisan Kamasan.", type="perkiraan", source_codes=[], stage_code=None)],
        reflection=None,
    )
    data.update(overrides)
    return LessonText(**data)


# ---------- templat ----------

def test_template_exists_for_every_stage_kind():
    from cv.stage_planner import TITLES_KIND

    assert set(TEMPLATES) == set(TITLES_KIND)
    out = template_lesson_text(STAGES, use_shading=False)
    assert [t.stage_code for t in out.stages] == [s.code for s in STAGES]
    assert out.culture_claims == [] and out.reflection is None


def test_templates_for_flat_art_never_mention_shading():
    out = template_lesson_text(STAGES, use_shading=False)
    assert find_errors(out, STAGES, CODES, set(), use_shading=False) == []


# ---------- validator ----------

def test_valid_output_has_no_errors():
    assert find_errors(good_output(), STAGES, CODES, set(), use_shading=False) == []


def test_errors_for_missing_stage_unknown_region_and_unsourced_fact():
    bad = good_output(
        stages=good_output().stages[:-1],
        region_labels=[RegionLabel(region_code="r99", label="x")],
        culture_claims=[CultureClaim(text="Karya ini dari Klungkung.", type="fakta", source_codes=[], stage_code=None)],
    )
    errors = " ".join(find_errors(bad, STAGES, CODES, set(), use_shading=False))
    assert "tepat satu teks" in errors and "r99" in errors and "fakta tanpa source_codes" in errors


def test_shading_words_forbidden_for_flat_art():
    stages = good_output().stages
    stages[3] = stages[3].model_copy(update={"action": "Tambahkan bayangan dan gradasi pada kain."})
    assert any("datar" in e for e in find_errors(good_output(stages=stages), STAGES, CODES, set(), use_shading=False))
    assert find_errors(good_output(stages=stages), STAGES, CODES, set(), use_shading=True) == []


def test_sanitize_downgrades_unsourced_fact_and_fills_missing_stage():
    bad = good_output(
        stages=good_output().stages[:-1],
        culture_claims=[CultureClaim(text="Dibuat di Klungkung.", type="fakta", source_codes=["palsu"], stage_code="stage_99")],
        reflection=Reflection(question="?", options=["a", "b", "c"], correct_index=0, answer_source_code="palsu"),
    )
    out, fixes = sanitize(bad, STAGES, CODES, {"kb_asli"}, use_shading=False)
    assert [t.stage_code for t in out.stages] == [s.code for s in STAGES]
    assert out.culture_claims[0].type == "perkiraan" and out.culture_claims[0].source_codes == []
    assert out.culture_claims[0].stage_code is None and out.reflection is None
    assert fixes


def test_sanitize_keeps_sourced_fact_and_cuts_long_text():
    long_action = "kata " * 200
    stages = good_output().stages
    stages[2] = stages[2].model_copy(update={"action": long_action})
    out, _ = sanitize(
        good_output(stages=stages, culture_claims=[CultureClaim(text="Fakta bersumber.", type="fakta", source_codes=["kb_asli"], stage_code="stage_3")]),
        STAGES, CODES, {"kb_asli"}, use_shading=False,
    )
    assert out.culture_claims[0].type == "fakta" and out.culture_claims[0].source_codes == ["kb_asli"]
    assert len(out.stages[2].action) <= 260


# ---------- alur write_lesson_text ----------

@pytest.fixture
def ai_on(monkeypatch):
    monkeypatch.setattr(oc, "ensure_available", lambda: None)
    monkeypatch.setattr(lesson_text, "load_culture_kb", lambda: ([], set()))
    calls = []

    def install(*outputs):
        seq = list(outputs)

        def fake_parse(**kwargs):
            calls.append(kwargs)
            item = seq.pop(0)
            if isinstance(item, Exception):
                raise item
            return oc.AIResult(item, "fake-model", 100, 200, 10)

        monkeypatch.setattr(oc, "parse", fake_parse)
        return calls

    return install


def test_no_consent_uses_templates_without_calling_ai(ai_on):
    calls = ai_on()
    text, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=False, safety_id="s", job_id=None)
    assert source == "template" and notes == ["ai_not_allowed"] and calls == []


def test_ai_unconfigured_falls_back(monkeypatch):
    monkeypatch.setattr(oc, "ensure_available", lambda: (_ for _ in ()).throw(oc.AIUnavailable("ai_unavailable")))
    _, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="s", job_id=None)
    assert source == "template" and notes == ["ai_unavailable"]


def test_ai_success_sends_both_images(ai_on):
    calls = ai_on(good_output())
    text, source, _ = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="rs_x", job_id="j")
    assert source == "ai" and text.region_labels[0].label == "jubah merah tokoh"
    parts = calls[0]["content"]
    assert sum(p["type"] == "input_image" for p in parts) == 2
    assert calls[0]["safety_id"] == "rs_x"


def test_ai_invalid_then_fixed_on_retry(ai_on):
    bad = good_output(stages=good_output().stages[:2])
    calls = ai_on(bad, good_output())
    _, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="s", job_id=None)
    assert source == "ai" and len(calls) == 2
    assert "melanggar aturan" in calls[1]["content"][-1]["text"]


def test_ai_invalid_twice_is_sanitized(ai_on):
    bad = good_output(stages=good_output().stages[:2])
    ai_on(bad, bad)
    text, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="s", job_id=None)
    assert source == "ai" and "retry_failed_sanitized" in notes
    assert len(text.stages) == len(STAGES)


def test_ai_refusal_falls_back_to_templates(ai_on):
    ai_on(oc.AIUnavailable("ai_refused"))
    _, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="s", job_id=None)
    assert source == "template" and notes == ["ai_refused"]


def test_session_deleted_before_sending_photo(ai_on):
    calls = ai_on(good_output())
    _, source, notes = lesson_text.write_lesson_text(fake_cv(), STAGES, use_ai=True, safety_id="s", job_id=None, still_allowed=lambda: False)
    assert source == "template" and notes == ["session_deleted"] and calls == []


def test_prompt_is_indonesian_and_forbids_guessing():
    text = lesson_text.INSTRUCTIONS
    assert "JANGAN menebak judul karya" in text and "bukan instruksi" in text


# ---------- openai_client.parse (respons SDK tiruan) ----------

class _Resp:
    def __init__(self, status="completed", parsed=None, refusal=False):
        from types import SimpleNamespace as NS

        self.status = status
        self.usage = NS(input_tokens=1000, output_tokens=500)
        self.output = [NS(content=[NS(type="refusal" if refusal else "output_text")])]
        self.output_parsed = parsed


@pytest.fixture
def fake_sdk(monkeypatch):
    from types import SimpleNamespace as NS

    recorded = []
    monkeypatch.setattr(oc, "_record_usage", lambda *a, **k: recorded.append(a))
    monkeypatch.setattr(oc, "get_settings", lambda: NS(openai_vision_model="model-uji", openai_price_input_per_m=1.0, openai_price_output_per_m=2.0))

    def install(behaviour):
        monkeypatch.setattr(oc, "_client", lambda: NS(responses=NS(parse=behaviour)))
        return recorded

    return install


def _call():
    return oc.parse(task="stage_text", instructions="i", content=[], schema=LessonText, safety_id="s", job_id=None)


def test_parse_success_records_usage(fake_sdk):
    recorded = fake_sdk(lambda **kw: _Resp(parsed=good_output()))
    result = _call()
    assert result.model == "model-uji" and result.input_tokens == 1000
    assert recorded[0][5] == "ok"  # outcome


def test_parse_sends_reasoning_effort_when_configured(monkeypatch):
    from types import SimpleNamespace as NS

    seen = []
    monkeypatch.setattr(oc, "_record_usage", lambda *a, **k: None)
    monkeypatch.setattr(oc, "get_settings", lambda: NS(openai_vision_model="m", openai_price_input_per_m=1.0, openai_price_output_per_m=2.0, openai_reasoning_effort="low"))
    monkeypatch.setattr(oc, "_client", lambda: NS(responses=NS(parse=lambda **kw: seen.append(kw) or _Resp(parsed=good_output()))))
    _call()
    assert seen[0]["reasoning"] == {"effort": "low"} and seen[0]["store"] is False


@pytest.mark.parametrize("resp,code,outcome", [
    (_Resp(status="incomplete"), "ai_unavailable", "truncated"),
    (_Resp(refusal=True, parsed=None), "ai_refused", "refusal"),
    (_Resp(parsed=None), "ai_unavailable", "schema_error"),
])
def test_parse_failures_are_mapped(fake_sdk, resp, code, outcome):
    recorded = fake_sdk(lambda **kw: resp)
    with pytest.raises(oc.AIUnavailable) as exc:
        _call()
    assert exc.value.code == code and recorded[0][5] == outcome


def test_parse_timeout_is_mapped(fake_sdk):
    import httpx
    from openai import APITimeoutError

    def boom(**kw):
        raise APITimeoutError(request=httpx.Request("POST", "https://api.openai.com"))

    recorded = fake_sdk(boom)
    with pytest.raises(oc.AIUnavailable):
        _call()
    assert recorded[0][5] == "timeout"


# ---------- model per tugas ----------

def test_task_model_and_price_override(monkeypatch):
    """OPENAI_TASK_MODELS memindahkan satu tugas ke model lain; biayanya dicatat dengan harga model itu."""
    from types import SimpleNamespace as NS

    seen, recorded = [], []
    monkeypatch.setattr(oc, "_record_usage", lambda *a, **k: recorded.append((a, k)))
    monkeypatch.setattr(oc, "get_settings", lambda: NS(
        openai_vision_model="utama", openai_price_input_per_m=1.0, openai_price_output_per_m=5.0,
        openai_task_models={"feedback": "murah"}, openai_model_prices={"murah": (0.1, 0.5)},
    ))
    monkeypatch.setattr(oc, "_client", lambda: NS(responses=NS(parse=lambda **kw: seen.append(kw["model"]) or _Resp(parsed=good_output()))))

    oc.parse(task="feedback", instructions="i", content=[], schema=LessonText, safety_id="s", job_id=None)
    oc.parse(task="stage_text", instructions="i", content=[], schema=LessonText, safety_id="s", job_id=None)

    assert seen == ["murah", "utama"]
    assert recorded[0][0][1] == "murah" and (recorded[0][1]["price_in"], recorded[0][1]["price_out"]) == (0.1, 0.5)
    assert recorded[1][0][1] == "utama" and (recorded[1][1]["price_in"], recorded[1][1]["price_out"]) == (1.0, 5.0)


def test_task_model_without_price_is_a_production_problem():
    from core.config import Settings

    s = Settings(_env_file=None, openai_vision_model="utama", openai_task_models={"feedback": "murah"})
    assert any("murah" in p for p in s.task_model_problems())
    ok = Settings(_env_file=None, openai_vision_model="utama", openai_task_models={"feedback": "murah"}, openai_model_prices={"murah": (0.1, 0.5)})
    assert ok.task_model_problems() == []


def test_task_models_parse_from_env(monkeypatch):
    from core.config import Settings

    monkeypatch.setenv("OPENAI_TASK_MODELS", '{"feedback": "gpt-6-luna"}')
    monkeypatch.setenv("OPENAI_MODEL_PRICES", '{"gpt-6-luna": [0.10, 0.50]}')
    s = Settings(_env_file=None)
    assert s.openai_task_models == {"feedback": "gpt-6-luna"}
    assert s.openai_model_prices == {"gpt-6-luna": (0.10, 0.50)}
