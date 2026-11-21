"""Tes stage_planner: invarian tahapan untuk berbagai bentuk region."""

import pytest

from cv.stage_planner import MAX_STAGES, MIN_STAGES, SMALL_PCT, plan_stages
from cv.types import Region


def region(code, area, *, bg=False, main=False, bbox=(0, 0, 10, 10)):
    return Region(
        code=code, hex="#808080", lab=[50.0, 0.0, 0.0], area_pct=area, bbox=list(bbox), centroid=[5, 5],
        is_main_object=main, is_background=bg, neighbors=[], value_level=None, path_svg="M0 0 Z",
    )


def figure_regions():
    """Latar, badan (objek utama), kepala, kain — seperti gambar sintetis di test_cv."""
    return [
        region("r01", 79.8, bg=True),
        region("r02", 14.2, main=True, bbox=(300, 400, 300, 600)),
        region("r03", 3.5, bbox=(340, 190, 220, 220)),
        region("r04", 2.5, bbox=(330, 650, 240, 110)),
    ]


def many_regions(n=35):
    regs = [region("r01", 40.0, bg=True)]
    regs += [region(f"r{i:02d}", 3.0 if i < 10 else (1.0 if i < 25 else 0.1), main=i % 2 == 0) for i in range(2, n + 1)]
    return regs


def assert_invariants(stages, regions, checkpoints):
    codes = [c for s in stages for c in s.region_codes]
    assert sorted(codes) == sorted(r.code for r in regions)
    assert len(codes) == len(set(codes))
    assert MIN_STAGES <= len(stages) <= MAX_STAGES
    assert [s.order_no for s in stages] == list(range(1, len(stages) + 1))
    assert stages[0].kind == "preparation" and stages[1].kind == "sketch" and stages[-1].kind == "finishing"
    assert stages[1].is_checkpoint
    assert sum(s.is_checkpoint for s in stages) == checkpoints


@pytest.mark.parametrize("checkpoints", [1, 2])
@pytest.mark.parametrize("shading", [False, True])
@pytest.mark.parametrize("make", [figure_regions, many_regions])
def test_invariants(make, shading, checkpoints):
    regs = make()
    stages = plan_stages(regs, use_shading=shading, checkpoint_count=checkpoints)
    assert_invariants(stages, regs, checkpoints)
    assert any(s.kind == "value" for s in stages) == shading


def test_order_and_content_for_figure():
    stages = plan_stages(figure_regions(), use_shading=False)
    kinds = [s.kind for s in stages]
    assert kinds == ["preparation", "sketch", "background_and_largest", "main_object", "medium_regions", "finishing"]
    by_kind = {s.kind: s.region_codes for s in stages}
    assert by_kind["background_and_largest"] == ["r01"]
    assert by_kind["main_object"] == ["r02"]
    assert by_kind["medium_regions"] == ["r03", "r04"]  # urut dari yang terbesar


def test_small_regions_go_to_detail_stage():
    regs = figure_regions() + [region("r05", SMALL_PCT / 2)]
    stages = plan_stages(regs, use_shading=False)
    detail = next(s for s in stages if s.kind == "small_and_detail")
    assert detail.region_codes == ["r05"] and "lineart" in detail.layers


def test_large_non_main_region_joins_background_stage():
    regs = [region("r01", 50, bg=True), region("r02", 20), region("r03", 10, main=True), region("r04", 5)]
    stages = plan_stages(regs, use_shading=False)
    assert next(s for s in stages if s.kind == "background_and_largest").region_codes == ["r01", "r02"]


def test_split_when_too_few_stages():
    # Hanya latar + 1 bidang → tahap region kurang; tahap terbesar dibelah agar tetap ≥6.
    regs = [region("r01", 60, bg=True), region("r02", 39), region("r03", 1)]
    stages = plan_stages(regs, use_shading=False)
    assert len(stages) >= MIN_STAGES
    assert_invariants(stages, regs, 1)


def test_finishing_has_original_photo_and_focus_bbox_union():
    stages = plan_stages(figure_regions(), use_shading=False)
    assert "original_photo" in stages[-1].layers
    medium = next(s for s in stages if s.kind == "medium_regions")
    assert medium.focus_bbox == [330, 190, 240, 570]


def test_without_mask_layer():
    stages = plan_stages(figure_regions(), use_shading=False, has_main_object_layer=False)
    assert "main_object" not in stages[1].layers


def test_second_checkpoint_after_medium_regions():
    stages = plan_stages(figure_regions(), use_shading=False, checkpoint_count=2)
    assert [s.kind for s in stages if s.is_checkpoint] == ["sketch", "medium_regions"]


def test_crowded_stage_is_split_for_beginners():
    # Lukisan ramai tanpa objek utama: 1 latar + 34 region sedang → dibelah, tiap tahap ≤ 10 bila muat.
    from cv.stage_planner import MAX_REGIONS_PER_STAGE

    regs = [region("r01", 30, bg=True)] + [region(f"r{i:02d}", 2.0) for i in range(2, 36)]
    stages = plan_stages(regs, use_shading=False)
    assert_invariants(stages, regs, 1)
    medium = [s for s in stages if s.kind == "medium_regions"]
    assert len(medium) >= 2 and [s.part for s in medium] == list(range(1, len(medium) + 1))
    assert len(stages) == MAX_STAGES or all(len(s.region_codes) <= MAX_REGIONS_PER_STAGE for s in medium)
