"""Planner tutorial bertahap (structure_version 2) dan pengelompokan campuran."""

import pytest

from color.mixes import MAX_MIXES, color_name, group_regions, region_mix_map
from cv.step_planner import MAX_REGIONS_PER_STEP, MAX_STEPS, plan_steps
from cv.types import Region


def region(i, lab, area, *, main=False, bg=False, box=(0, 0, 100, 100)):
    return Region(code=f"r{i:02d}", hex="#808080", lab=list(lab), area_pct=area, bbox=list(box), centroid=[box[0], box[1]],
                  is_main_object=main, is_background=bg, neighbors=[], value_level=None, path_svg="")


def plan(regions, *, shading=False, block_in=True):
    groups = group_regions(regions)
    return groups, plan_steps(regions, region_mix_map(groups), [g.mix_id for g in groups], use_shading=shading,
                              width=800, height=1200, has_block_in=block_in, has_main_object_layer=block_in,
                              landmark_cells=["B1", "C4", "A6"])


def many_regions(n=30):
    labs = [(20 + (i * 7) % 70, -30 + (i * 13) % 60, -30 + (i * 17) % 60) for i in range(n)]
    return [region(i + 1, labs[i], 10 - i * 0.3 if i < 30 else 0.1, main=i % 3 == 0, bg=i % 5 == 0,
                   box=((i * 37) % 700, (i * 53) % 1100, 100, 100)) for i in range(n)]


def test_at_most_six_mixes_and_every_region_has_one():
    regions = many_regions()
    groups = group_regions(regions)
    assert 1 <= len(groups) <= MAX_MIXES
    mapping = region_mix_map(groups)
    assert sorted(mapping) == sorted(r.code for r in regions)
    assert [g.order_no for g in groups] == list(range(1, len(groups) + 1))
    assert len({g.name for g in groups}) == len(groups)  # nama campuran tidak kembar


def test_similar_colors_share_one_mix():
    regions = [region(1, (50, 10, 10), 20), region(2, (51, 11, 9), 10), region(3, (52, 9, 11), 5)]
    assert len(group_regions(regions)) == 1


def test_three_phases_order_and_checkpoints():
    _, steps = plan(many_regions())
    phases = [s.phase for s in steps]
    assert phases == sorted(phases, key=["sketch", "color", "finishing"].index)
    kinds = [s.kind for s in steps]
    assert kinds[:7] == ["preparation", "grid", "landmarks", "block_in", "background_lines", "contour", "sketch_check"]
    assert kinds[-1] == "compare"
    checkpoints = [s for s in steps if s.is_checkpoint]
    assert [c.kind for c in checkpoints] == ["sketch_check", "paint_mix"]
    assert checkpoints[1] is [s for s in steps if s.kind == "paint_mix"][-1]


def test_one_mix_per_paint_step_and_few_regions():
    groups, steps = plan(many_regions())
    mapping = region_mix_map(groups)
    for s in steps:
        if s.kind == "paint_mix":
            assert len(s.region_codes) <= MAX_REGIONS_PER_STEP
            assert {mapping[c] for c in s.region_codes} == {s.mix_id}
    assert len(steps) <= MAX_STEPS


def test_without_main_object_sketch_has_six_steps():
    _, steps = plan(many_regions(12), block_in=False)
    assert [s.kind for s in steps if s.phase == "sketch"] == ["preparation", "grid", "landmarks", "background_lines", "contour", "sketch_check"]


def test_shading_adds_value_and_accents():
    _, steps = plan(many_regions(12), shading=True)
    kinds = [s.kind for s in steps]
    assert "value" in kinds and "accents" in kinds
    assert kinds.index("value") > max(i for i, k in enumerate(kinds) if k == "paint_mix")


def test_new_lines_follow_line_levels():
    _, steps = plan(many_regions(12))
    new = {s.kind: s.new_lines for s in steps}
    assert new["block_in"] == "block_in" and new["background_lines"] == "background_lines"
    assert new["contour"] == "sketch" and new["small_and_detail"] == "lineart"
    assert all(c[0] in "ABCD" for s in steps for c in s.grid_cells)


@pytest.mark.parametrize("lab,expected", [((95, 0, 0), "putih"), ((10, 0, 0), "hitam"), ((40, 20, 40), "cokelat"), ((60, -40, 30), "hijau")])
def test_color_names(lab, expected):
    assert color_name(lab) == expected
