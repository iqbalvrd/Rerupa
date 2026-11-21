"""Tes pipeline CV checkpoint + penulis feedback (tanpa jaringan). Foto progres sintetis: kertas
bergrid + garis pensil, difoto miring dengan cahaya tidak rata dan derau (tests/checkpoint_synth.py)."""

import pytest

import checkpoint_synth as S
from ai import feedback as fb
from cv import align as al
from cv import checkpoint as cp
from cv import compare as cmp
from cv import svgpath
from cv.normalize import encode_jpeg

T = S.target()
TARGET = cp.TargetLesson(T["width"], T["height"], T["regions_svg"], T["sketch_svg"], T["main_object_svg"], [cmp.TargetRegion(**r) for r in T["regions"]], T["grid"])


def run(paper, blur=0.8, corners=None, kind="sketch", open_codes=frozenset()):
    photo, c = S.photograph(paper, blur=blur)
    return cp.run(encode_jpeg(photo, 92), corners(c) if corners else c, TARGET, kind, set(open_codes))


def kinds(res):
    return {(c["region_code"], c["kind"]) for c in res.candidates}


# ---------------------------------------------------------------- svgpath

def test_svg_roundtrip_region_areas():
    size, scale = al.work_size(T["width"], T["height"])
    labels = svgpath.region_labels(T["regions_svg"], [r["code"] for r in T["regions"]], size, scale)
    for i, r in enumerate(T["regions"]):
        got = float((labels == i).mean() * 100)
        assert got == pytest.approx(r["area_pct"], abs=1.0)
    assert (labels >= 0).all()  # latar (dengan lubang even-odd) + bentuk menutup seluruh bidang


def test_order_corners_any_order():
    pts = [10, 10, 100, 12, 98, 80, 8, 78]
    shuffled = [98, 80, 10, 10, 8, 78, 100, 12]
    assert al.order_corners(pts).tolist() == al.order_corners(shuffled).tolist()
    assert al.order_corners(shuffled)[0].tolist() == [10, 10]


# ---------------------------------------------------------------- hasil benar

def test_correct_sketch_has_no_candidates():
    res = run(S.drawing())
    assert not res.needs_retake and res.alignment == "confirmed" and res.alignment_method == "grid"
    assert res.candidates == []
    assert res.metrics["line_recall"] > 0.9
    assert res.rectified_jpeg and res.overlay_jpeg


def test_small_shift_is_tolerated():
    assert run(S.drawing(shift={"r02": (25, 0)})).candidates == []


def test_without_grid_falls_back_to_line_alignment():
    res = run(S.drawing(draw_grid=False))
    assert res.alignment_method == "lines" and res.candidates == []


def test_slightly_off_corner_taps_are_corrected_by_grid():
    res = run(S.drawing(), corners=lambda c: [v + (25 if i % 2 == 0 else 16) for i, v in enumerate(c)])
    assert res.alignment == "confirmed" and res.candidates == []


# ---------------------------------------------------------------- kesalahan yang harus terdeteksi

def test_shifted_main_object():
    res = run(S.drawing(shift={"r02": (90, 0)}))
    top = res.candidates[0]
    assert (top["region_code"], top["kind"]) == ("main", "shifted")
    assert top["facts"]["direction"] == "kanan"
    assert all(c["region_code"] != "r02" for c in res.candidates)  # region = siluet → dinilai sekali


def test_whole_sketch_shift_is_one_global_suggestion():
    res = run(S.drawing(shift=(80, 50)))
    top = res.candidates[0]
    assert (top["region_code"], top["kind"]) == ("sketch", "shifted") and top["facts"]["direction"] == "kanan bawah"
    assert all(c["region_code"] == "sketch" for c in res.candidates)  # setelah dikompensasi, tak ada sisa kesalahan palsu
    text = fb.template_suggestion(top, {})
    assert text.observation.startswith("Seluruh sketsa tampak bergeser") and "ke kiri atas" in text.action


def test_shift_without_grid_detected_with_direction():
    res = run(S.drawing(draw_grid=False, shift={"r02": (-80, 40)}))
    assert res.candidates[0]["kind"] == "shifted" and res.candidates[0]["facts"]["direction"].startswith("kiri")


def test_too_wide_shape():
    res = run(S.drawing(scale_x={"r03": 1.35}))
    assert ("r03", "too_wide") in kinds(res)
    c = next(c for c in res.candidates if c["region_code"] == "r03")
    assert c["location"] == "kanan bawah" and c["facts"]["side"] == "kedua sisi"
    x, y, w, h = c["bbox"]
    assert 780 <= x <= 900 and 480 <= y <= 560  # bbox di koordinat lesson


def test_missing_outline():
    assert ("r03", "missing_outline") in kinds(run(S.drawing(scale_x={"r03": 0.01})))


def test_paint_stage_unfilled_region():
    res = run(S.drawing(paint=True, scale_x={"r03": 0.4}), kind="medium_regions", open_codes={"r02", "r03"})
    assert ("r03", "unfilled") in kinds(res)
    assert res.metrics["regions"]["r02"]["fill_pct"] > 90


def test_candidates_capped_at_three():
    res = run(S.drawing(shift={"r02": (90, 0), "r03": (0, 60)}, scale_x={"r03": 1.4}))
    assert 1 <= len(res.candidates) <= cmp.MAX_CANDIDATES


def test_paint_stage_aligns_on_color_edges_without_grid():
    paper = S.drawing(paint=True, draw_grid=False, draw_shapes=False)
    res = run(paper, kind="medium_regions", open_codes={"r02", "r03"})
    assert not res.needs_retake and res.alignment_method == "color_edges" and res.candidates == []
    res = run(paper, kind="medium_regions", open_codes={"r02", "r03"}, corners=lambda c: [v + (25 if i % 2 == 0 else 16) for i, v in enumerate(c)])
    assert res.alignment == "confirmed" and res.candidates == []


def test_paint_stage_detects_unfilled_without_grid():
    res = run(S.drawing(paint=True, draw_grid=False, draw_shapes=False, scale_x={"r03": 0.4}), kind="medium_regions", open_codes={"r02", "r03"})
    assert [(c["region_code"], c["kind"]) for c in res.candidates] == [("r03", "unfilled")]


def test_empty_canvas_at_paint_stage_needs_retake():
    res = run(S.drawing(draw_grid=False, draw_shapes=False), kind="medium_regions", open_codes={"r02", "r03"})
    assert res.needs_retake and res.retake_code == "progress_not_visible"


# ---------------------------------------------------------------- foto ulang

def test_blank_sketch_needs_retake():
    res = run(S.drawing(draw_shapes=False))
    assert res.needs_retake and res.retake_code == "sketch_not_visible" and res.candidates == []


def test_very_blurry_photo_needs_retake():
    res = run(S.drawing(), blur=8)
    assert res.needs_retake and res.retake_code == "photo_unusable"


@pytest.mark.parametrize("corners", [
    lambda c: [100, 100, 200, 100, 200, 180, 100, 180],  # terlalu kecil
    lambda c: [100, 100, 1500, 100, 120, 1100, 1480, 1100],  # sudut urutan bersilang, bukan bidang kertas
    lambda c: [200, 500, 1400, 500, 1400, 700, 200, 700],  # proporsi jauh berbeda
    lambda c: [v + (70 if i % 2 == 0 else 50) for i, v in enumerate(c)],  # meleset jauh
])
def test_bad_corners_need_retake_without_suggestions(corners):
    res = run(S.drawing(shift={"r02": (90, 0)}), corners=corners)
    assert res.needs_retake and res.retake_code == "alignment_failed"
    assert res.candidates == [] and res.alignment == "failed"


def test_dark_photo_needs_retake():
    paper = S.drawing()
    paper[:] = (paper * 0.2).astype(paper.dtype)
    res = run(paper)
    assert res.needs_retake and res.retake_code == "photo_unusable" and "too_dark" in res.reasons


# ---------------------------------------------------------------- teks feedback

CANDS = [
    {"region_code": "main", "kind": "shifted", "facts": {"direction": "kanan", "shift_pct": 6.8}, "location": "tengah", "bbox": [1, 2, 3, 4]},
    {"region_code": "r03", "kind": "too_wide", "facts": {"change_pct": 33, "side": "kiri"}, "location": "kanan bawah", "bbox": [5, 6, 7, 8]},
    {"region_code": "r07", "kind": "missing_outline", "facts": {"drawn_pct": 10}, "location": "kiri atas", "bbox": [0, 0, 1, 1]},
]


def test_template_feedback_max_two_from_candidates():
    out = fb.template_feedback("sketch", CANDS, {"line_recall": 0.7}, {"r03": "kotak biru"})
    assert len(out.suggestions) == 2
    assert [s.region_code for s in out.suggestions] == ["main", "r03"]
    assert "ke kanan" in out.suggestions[0].observation and "ke kiri" in out.suggestions[0].action
    assert "Sisi kiri kotak biru" in out.suggestions[1].observation
    assert out.summary.startswith("Bentuk utama sudah terbaca")


def test_template_feedback_without_candidates_is_positive():
    out = fb.template_feedback("sketch", [], {}, {})
    assert out.suggestions == [] and "sudah sesuai" in out.summary


def test_feedback_validator_rejects_region_outside_candidates():
    out = fb.FeedbackText(summary="Bagus.", suggestions=[fb.FeedbackSuggestion(region_code="r99", observation="x", action="y")])
    errors = fb.find_errors(out, ["main", "r03"], use_shading=True)
    assert any("bukan kandidat" in e for e in errors)
    assert fb.sanitize(out, ["main", "r03"], True).suggestions == []


def test_feedback_validator_limits_and_shading():
    many = [fb.FeedbackSuggestion(region_code=c, observation="o", action="a") for c in ("main", "r03", "r07")]
    assert any("maksimal" in e for e in fb.find_errors(fb.FeedbackText(summary="s", suggestions=many), ["main", "r03", "r07"], True))
    flat = fb.FeedbackText(summary="s", suggestions=[fb.FeedbackSuggestion(region_code="main", observation="o", action="Tambahkan bayangan di kiri.")])
    assert fb.find_errors(flat, ["main"], use_shading=False)
    assert len(fb.sanitize(fb.FeedbackText(summary="s", suggestions=many), ["main", "r03", "r07"], True).suggestions) == 2


def test_write_feedback_uses_template_without_consent():
    text, source, notes = fb.write_feedback(stage_kind="sketch", stage_title="Sketsa", candidates=CANDS, metrics={}, labels={}, use_shading=True, overlay_jpeg=b"x", use_ai=False, safety_id="rs_x", job_id=None)
    assert source == "template" and notes == ["ai_not_allowed"] and len(text.suggestions) == 2


def test_write_feedback_ai_retry_then_valid(monkeypatch):
    from types import SimpleNamespace

    from ai import openai_client as oc

    bad = fb.FeedbackText(summary="s", suggestions=[fb.FeedbackSuggestion(region_code="r99", observation="o", action="a")])
    good = fb.FeedbackText(summary="Bentuk sudah terbaca.", suggestions=[fb.FeedbackSuggestion(region_code="r03", observation="Kotak kanan bawah melebar.", action="Rapatkan sisi kirinya.")])
    calls = []
    monkeypatch.setattr(oc, "ensure_available", lambda: None)
    monkeypatch.setattr(oc, "parse", lambda **kw: calls.append(kw) or SimpleNamespace(parsed=bad if len(calls) == 1 else good))
    text, source, _ = fb.write_feedback(stage_kind="sketch", stage_title="Sketsa", candidates=CANDS, metrics={}, labels={}, use_shading=True, overlay_jpeg=b"x", use_ai=True, safety_id="rs_x", job_id=None)
    assert source == "ai" and text.suggestions[0].region_code == "r03" and len(calls) == 2
    assert "bukan kandidat" in calls[1]["content"][-1]["text"]


def test_write_feedback_ai_invalid_twice_falls_back(monkeypatch):
    from types import SimpleNamespace

    from ai import openai_client as oc

    bad = fb.FeedbackText(summary="s", suggestions=[fb.FeedbackSuggestion(region_code="r99", observation="o", action="a")])
    monkeypatch.setattr(oc, "ensure_available", lambda: None)
    monkeypatch.setattr(oc, "parse", lambda **kw: SimpleNamespace(parsed=bad))
    text, source, notes = fb.write_feedback(stage_kind="sketch", stage_title="Sketsa", candidates=CANDS, metrics={}, labels={}, use_shading=True, overlay_jpeg=b"x", use_ai=True, safety_id="rs_x", job_id=None)
    assert source == "template" and notes == ["retry_failed"] and text.suggestions[0].region_code == "main"
