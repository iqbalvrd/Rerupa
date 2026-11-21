"""Tes pencampuran warna (tanpa jaringan)."""

import numpy as np
import pytest

from color.mixer import (
    ESTIMATE_MAX_DE,
    Paint,
    best_mix,
    delta_e,
    explain,
    hex_to_lab,
    hex_to_rgb,
    mix_table,
    rgb_to_hex,
)

REF = (
    Paint("p1", "cadmium_yellow", "Kuning Kadmium", "#FEEC00"),
    Paint("p2", "cadmium_red", "Merah Kadmium", "#E12301"),
    Paint("p3", "cobalt_blue", "Biru Kobalt", "#002185"),
    Paint("p4", "burnt_sienna", "Sienna Bakar", "#7B4800"),
    Paint("p5", "titanium_white", "Putih Titanium", "#FFFFFF"),
    Paint("p6", "ivory_black", "Hitam Gading", "#1E1E1E"),
)


def test_hex_roundtrip_and_lab():
    assert rgb_to_hex(hex_to_rgb("#B5532E")) == "#B5532E"
    white = hex_to_lab("#FFFFFF")
    assert abs(white[0] - 100) < 0.5 and abs(white[1]) < 0.5


def test_table_contains_singles_pairs_and_triples():
    t = mix_table(REF)
    sizes = {len(i) for i, _ in t.combos}
    assert sizes == {1, 2, 3}
    assert len(t.combos) == t.lab.shape[0] == t.rgb.shape[0]


def test_exact_paint_returns_single_paint():
    mix = best_mix("#E12301", mix_table(REF))
    assert [p.code for p, _ in mix.components] == ["cadmium_red"]
    assert mix.delta_e < 1.0 and mix.reachability == "estimate"


def test_blue_and_yellow_make_green_like_pigment():
    t = mix_table(REF)
    i = next(k for k, (idx, parts) in enumerate(t.combos) if idx == (0, 2) and parts == (1, 1))
    r, g, b = hex_to_rgb(rgb_to_hex(t.rgb[i]))
    assert g > r and g > b  # campuran pigmen → hijau, bukan abu-abu seperti rata-rata RGB


def test_brick_red_uses_mixture_and_is_close():
    mix = best_mix("#B5532E", mix_table(REF))
    assert len(mix.components) >= 2 and mix.delta_e <= ESTIMATE_MAX_DE
    assert "Perkiraan, uji sedikit dulu" in mix.explanation
    assert mix.components[0][1] >= mix.components[-1][1]  # bagian terbesar disebut dulu


def test_unreachable_color_is_marked_hard():
    tiny = (Paint("a", "cadmium_yellow", "Kuning", "#FEEC00"), Paint("b", "titanium_white", "Putih", "#FFFFFF"))
    mix = best_mix("#1A3FB0", mix_table(tiny))  # biru tidak bisa dibuat dari kuning + putih
    assert mix.reachability == "hard" and "Sulit dicapai" in mix.explanation


def test_simple_recipe_preferred_when_nearly_as_good():
    mix = best_mix("#FFFFFF", mix_table(REF))
    assert len(mix.components) == 1 and mix.components[0][0].code == "titanium_white"


def test_tested_recipe_wins_when_close():
    tested = [{
        "id": "rec-1",
        "target_hex": "#B5532E",
        "target_lab": list(hex_to_lab("#B5532E")),
        "components": [{"paint_id": "p2", "parts": 2}, {"paint_id": "p4", "parts": 3}],
    }]
    mix = best_mix("#B6542F", mix_table(REF), tested)
    assert mix.reachability == "recipe" and mix.recipe_id == "rec-1"
    assert mix.explanation.startswith("Resep teruji")
    assert [p.code for p, _ in mix.components] == ["burnt_sienna", "cadmium_red"]


def test_tested_recipe_ignored_when_far():
    tested = [{"id": "rec-1", "target_hex": "#00FF00", "target_lab": list(hex_to_lab("#00FF00")), "components": [{"paint_id": "p1", "parts": 1}]}]
    assert best_mix("#B5532E", mix_table(REF), tested).reachability != "recipe"


def test_correction_tip_when_mix_too_light():
    tiny = (Paint("a", "cadmium_yellow", "Kuning", "#FEEC00"), Paint("b", "ivory_black", "Hitam", "#1E1E1E"), Paint("c", "titanium_white", "Putih", "#FFFFFF"))
    mix = best_mix("#5A4A00", mix_table(tiny))
    assert isinstance(mix.tips, list)


def test_delta_e_is_symmetric_and_zero_on_same():
    a, b = hex_to_lab("#B5532E"), hex_to_lab("#2E53B5")
    assert float(delta_e(a, a)) == pytest.approx(0, abs=1e-6)
    assert float(delta_e(a, b)) == pytest.approx(float(delta_e(b, a)), rel=1e-3)


def test_explain_never_changes_numbers():
    mix = best_mix("#B5532E", mix_table(REF))
    for paint, parts in mix.components:
        assert f"{parts} bagian {paint.name}" in mix.explanation or (len(mix.components) == 1 and paint.name in mix.explanation)
    assert explain(mix) == mix.explanation


def test_estimate_json_shape():
    mix = best_mix("#B5532E", mix_table(REF))
    data = mix.estimate_json()
    assert set(data) == {"components", "mixed_hex", "delta_e", "tips"}
    assert all(set(c) == {"paint_id", "paint_code", "parts"} for c in data["components"])
    assert np.isfinite(data["delta_e"])
