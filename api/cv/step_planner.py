"""Planner tutorial bertahap (structure_version 2): 3 fase, 14–20 langkah kecil. Oleh KODE, bukan AI.

Rencana: docs/RENCANA_TUTORIAL_BERTAHAP.md §3; kontrak: api/API.md "Tutorial bertahap".
Planner lama (cv/stage_planner.py, 8 tahap) tetap dipakai untuk membaca/menguji lesson v1.

Sketsa (7): preparation → grid → landmarks → block_in → background_lines → contour → sketch_check
            (tanpa objek utama: block_in tidak ada, jadi 6)
Warna:      color_prep → paint_mix × campuran (≤ MAX_REGIONS_PER_STEP region besar per langkah)
            → value (hanya use_shading)
Finishing:  small_and_detail (region kecil + garis detail) → accents (hanya use_shading) → compare

Checkpoint: sketch_check dan paint_mix terakhir (setelah warna dasar).
Jaminan: setiap region dibuka tepat sekali; maks MAX_REGIONS_PER_STEP region baru per langkah warna;
total langkah ≤ MAX_STEPS (bila lebih, jatah region per langkah dinaikkan).
"""

from cv.grid import cells_for_bbox
from cv.stage_planner import PlannedStage, _union_bbox
from cv.types import Region

MAX_STEPS = 20
MAX_REGIONS_PER_STEP = 5  # heuristik riset: maks ±5 bidang baru per langkah
SMALL_PCT = 0.3  # region lebih kecil dari ini dicat di langkah detail (finishing)


def plan_steps(
    regions: list[Region],
    region_mix: dict[str, str],
    mix_order: list[str],
    *,
    use_shading: bool,
    width: int,
    height: int,
    has_block_in: bool,
    has_main_object_layer: bool,
    landmark_cells: list[str],
) -> list[PlannedStage]:
    by_code = {r.code: r for r in regions}
    main_codes = [r.code for r in regions if r.is_main_object]
    bg_codes = [r.code for r in regions if not r.is_main_object]
    obj = ["main_object"] if has_main_object_layer else []

    def cells(codes: list[str]) -> list[str]:
        if not codes:
            return []
        x, y, w, h = _union_bbox([by_code[c].bbox for c in codes])
        return cells_for_bbox([x, y, x + w, y + h], width, height)

    def focus(codes: list[str]) -> list[int] | None:
        return _union_bbox([by_code[c].bbox for c in codes]) if codes else None

    steps: list[dict] = []

    def add(phase, kind, layers, *, new_lines=None, codes=(), grid=None, mix_id=None, checkpoint=False, focus_codes=None):
        steps.append(dict(phase=phase, kind=kind, layers=layers, new_lines=new_lines, region_codes=list(codes),
                          grid_cells=grid if grid is not None else cells(list(codes)), mix_id=mix_id,
                          is_checkpoint=checkpoint, focus_bbox=focus(list(focus_codes if focus_codes is not None else codes))))

    # ---- Fase 1: Sketsa
    coarse = ["block_in"] if has_block_in else []
    add("sketch", "preparation", [], grid=[])
    add("sketch", "grid", ["grid"], new_lines="grid", grid=[])
    add("sketch", "landmarks", ["grid", "landmarks"], new_lines="landmarks", grid=sorted(set(landmark_cells)))
    if has_block_in:
        add("sketch", "block_in", ["grid", "landmarks", "block_in"], new_lines="block_in", grid=cells(main_codes), focus_codes=main_codes)
    add("sketch", "background_lines", ["grid", "landmarks", *coarse, "background_lines"], new_lines="background_lines",
        grid=cells(bg_codes), focus_codes=bg_codes)
    add("sketch", "contour", ["grid", *coarse, "background_lines", "sketch", *obj], new_lines="sketch",
        grid=cells(main_codes or [r.code for r in regions]), focus_codes=main_codes)
    add("sketch", "sketch_check", ["grid", "sketch", *obj], checkpoint=True, grid=[])

    # ---- Fase 2: Warna
    small = [r.code for r in regions if r.area_pct < SMALL_PCT]
    fixed_after = (1 if use_shading else 0) + 1 + (1 if use_shading else 0) + 1  # value, detail, accents, compare
    per_step = MAX_REGIONS_PER_STEP
    while True:
        chunks = _paint_chunks(regions, region_mix, mix_order, small, per_step)
        if len(steps) + 1 + len(chunks) + fixed_after <= MAX_STEPS or per_step > 50:
            break
        per_step += 1
    add("color", "color_prep", ["sketch", "regions"], grid=[])
    for i, (mix_id, codes) in enumerate(chunks):
        add("color", "paint_mix", ["sketch", "regions"], codes=codes, mix_id=mix_id, checkpoint=i == len(chunks) - 1)
    if use_shading:
        add("color", "value", ["regions", "value"], grid=[])

    # ---- Fase 3: Finishing
    add("finishing", "small_and_detail", ["regions", "lineart"], new_lines="lineart", codes=small)
    if use_shading:
        add("finishing", "accents", ["regions", "value"], grid=[])
    add("finishing", "compare", ["regions", "lineart", "original_photo"], grid=[])

    planned = [
        PlannedStage(
            code=f"step_{n}", order_no=n, kind=s["kind"], layers=s["layers"], region_codes=s["region_codes"],
            is_checkpoint=s["is_checkpoint"], focus_bbox=s["focus_bbox"], phase=s["phase"], new_lines=s["new_lines"],
            grid_cells=s["grid_cells"], mix_id=s["mix_id"],
        )
        for n, s in enumerate(steps, start=1)
    ]
    _check(planned, regions)
    return planned


def _paint_chunks(regions, region_mix, mix_order, small, per_step) -> list[tuple[str, list[str]]]:
    """Satu campuran per langkah; campuran dengan > per_step region besar dibelah (yang terbesar dulu)."""
    small_set = set(small)
    chunks = []
    for mix_id in mix_order:
        codes = [r.code for r in sorted(regions, key=lambda r: (not r.is_background, -r.area_pct))
                 if region_mix.get(r.code) == mix_id and r.code not in small_set]
        n = -(-len(codes) // per_step)  # jumlah langkah untuk campuran ini
        size, extra = divmod(len(codes), n) if n else (0, 0)
        start = 0
        for i in range(n):  # rata: 11 region → 4, 4, 3 (bukan 5, 5, 1); yang terbesar lebih dulu
            end = start + size + (1 if i < extra else 0)
            chunks.append((mix_id, codes[start:end]))
            start = end
    return chunks


def _check(steps: list[PlannedStage], regions: list[Region]) -> None:
    """Invarian; gagal = bug kode, bukan masalah foto."""
    codes = [c for s in steps for c in s.region_codes]
    assert sorted(codes) == sorted(r.code for r in regions), "setiap region harus dibuka tepat sekali"
    assert [s.order_no for s in steps] == list(range(1, len(steps) + 1))
    assert len(steps) <= MAX_STEPS, f"terlalu banyak langkah: {len(steps)}"
    assert steps[0].kind == "preparation" and steps[-1].kind == "compare"
    assert sum(s.is_checkpoint for s in steps) in (1, 2)
    assert all(s.mix_id for s in steps if s.kind == "paint_mix")
