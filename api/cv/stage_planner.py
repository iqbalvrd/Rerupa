"""Pembagian region ke tahap oleh KODE (PRD v1.3 §8). AI tidak mengatur urutan; AI hanya menulis teks.

Aturan default:
  1 Persiapan + grid
  2 Sketsa bentuk besar                         ← checkpoint (versi awal)
  3 Latar + region besar (bukan objek utama)
  4 Objek utama
  5 Region sedang                               ← checkpoint ke-2 (showcase)
  6 Terang-gelap (hanya bila use_shading)
  7 Region kecil (< 0,3%) + garis detail
  8 Penyelesaian + foto asli

Jaminan: tahapan kumulatif, setiap region dibuka tepat sekali, jumlah tahap 6–8,
jumlah checkpoint = checkpoint_count. Tahap region yang kosong dibuang; bila tahap
kurang dari 6, tahap region terbesar dibelah dua.
"""

from dataclasses import dataclass, field

from cv.types import Region

SMALL_PCT = 0.3  # region lebih kecil dari ini masuk tahap detail
LARGE_PCT = 8.0  # region non-objek seluas ini ikut tahap latar
MIN_STAGES = 6
MAX_STAGES = 8
MAX_REGIONS_PER_STAGE = 10  # lebih dari ini terlalu banyak untuk satu langkah pemula

TITLES_KIND = {
    "preparation": "Persiapan",
    "sketch": "Sketsa bentuk besar",
    "background_and_largest": "Latar dan bidang terbesar",
    "main_object": "Objek utama",
    "medium_regions": "Bidang sedang",
    "value": "Terang-gelap",
    "small_and_detail": "Bidang kecil dan detail",
    "finishing": "Penyelesaian",
}

LAYERS = {
    "preparation": ["grid"],
    "sketch": ["grid", "sketch", "main_object"],
    "background_and_largest": ["sketch", "regions"],
    "main_object": ["sketch", "regions"],
    "medium_regions": ["sketch", "regions"],
    "value": ["regions", "value"],
    "small_and_detail": ["regions", "lineart"],
    "finishing": ["regions", "lineart", "original_photo"],
}


@dataclass
class PlannedStage:
    code: str
    order_no: int
    kind: str
    layers: list[str]
    region_codes: list[str] = field(default_factory=list)
    is_checkpoint: bool = False
    focus_bbox: list[int] | None = None
    part: int = 0  # >0 bila tahap hasil belahan (bagian ke-n)


def plan_stages(
    regions: list[Region],
    *,
    use_shading: bool,
    checkpoint_count: int = 1,
    has_main_object_layer: bool = True,
) -> list[PlannedStage]:
    if checkpoint_count not in (1, 2):
        raise ValueError("checkpoint_count harus 1 atau 2")

    by_code = {r.code: r for r in regions}
    placed: set[str] = set()

    def take(pred) -> list[str]:
        codes = [r.code for r in sorted(regions, key=lambda r: -r.area_pct) if r.code not in placed and pred(r)]
        placed.update(codes)
        return codes

    background = take(lambda r: r.is_background or (not r.is_main_object and r.area_pct >= LARGE_PCT))
    small = take(lambda r: r.area_pct < SMALL_PCT)
    main = take(lambda r: r.is_main_object)
    medium = take(lambda r: True)

    raw: list[tuple[str, list[str]]] = [
        ("preparation", []),
        ("sketch", []),
        ("background_and_largest", background),
        ("main_object", main),
        ("medium_regions", medium),
    ]
    if use_shading:
        raw.append(("value", []))
    raw += [("small_and_detail", small), ("finishing", [])]

    region_kinds = {"background_and_largest", "main_object", "medium_regions", "small_and_detail"}
    stages = [(kind, codes, 0) for kind, codes in raw if kind not in region_kinds or codes]

    # Pastikan minimal 6 tahap: belah tahap region yang paling banyak region-nya.
    while len(stages) < MIN_STAGES:
        candidates = [i for i, (k, c, _) in enumerate(stages) if k in region_kinds and len(c) >= 2]
        if not candidates:
            break
        i = max(candidates, key=lambda j: len(stages[j][1]))
        kind, codes, _ = stages[i]
        half = (len(codes) + 1) // 2  # bagian pertama berisi region yang lebih besar
        stages[i : i + 1] = [(kind, codes[:half], 1), (kind, codes[half:], 2)]

    # Tahap yang terlalu padat untuk pemula dibelah selama total tahap masih ≤ 8
    # (mis. lukisan ramai tanpa objek utama yang jelas → hampir semua region masuk "bidang sedang").
    while len(stages) < MAX_STAGES:
        crowded = [i for i, (k, c, _) in enumerate(stages) if k in region_kinds and len(c) > MAX_REGIONS_PER_STAGE]
        if not crowded:
            break
        i = max(crowded, key=lambda j: len(stages[j][1]))
        kind, codes, part = stages[i]
        half = (len(codes) + 1) // 2
        first_part = part or 1
        stages[i : i + 1] = [(kind, codes[:half], first_part), (kind, codes[half:], first_part + 1)]

    # Tidak boleh melebihi 8: gabungkan tahap region bersebelahan yang paling sedikit isinya.
    while len(stages) > MAX_STAGES:
        pairs = [
            i
            for i in range(len(stages) - 1)
            if stages[i][0] in region_kinds and stages[i + 1][0] in region_kinds
        ]
        if not pairs:
            break
        i = min(pairs, key=lambda j: len(stages[j][1]) + len(stages[j + 1][1]))
        stages[i : i + 2] = [(stages[i][0], stages[i][1] + stages[i + 1][1], 0)]

    # Ratakan isi tahap sejenis yang dibelah (mis. 9/8/16 → 11/11/11), urutan tetap dari region
    # terbesar, lalu nomori "bagian" 1, 2, 3, …; tahap tunggal = 0.
    balanced = []
    for kind in dict.fromkeys(k for k, _, _ in stages):
        idx = [i for i, (k, _, _) in enumerate(stages) if k == kind]
        if len(idx) == 1:
            continue
        all_codes = [c for i in idx for c in stages[i][1]]
        n = len(idx)
        size, extra = divmod(len(all_codes), n)
        start = 0
        for part, i in enumerate(idx):
            end = start + size + (1 if part < extra else 0)
            stages[i] = (kind, all_codes[start:end], part + 1)
            start = end
    balanced = [(k, c, p if sum(1 for kk, _, _ in stages if kk == k) > 1 else 0) for k, c, p in stages]
    stages = balanced

    planned: list[PlannedStage] = []
    for n, (kind, codes, part) in enumerate(stages, start=1):
        layers = [layer for layer in LAYERS[kind] if has_main_object_layer or layer != "main_object"]
        planned.append(
            PlannedStage(
                code=f"stage_{n}",
                order_no=n,
                kind=kind,
                layers=layers,
                region_codes=list(codes),
                focus_bbox=_union_bbox([by_code[c].bbox for c in codes]) if codes else None,
                part=part,
            )
        )

    _assign_checkpoints(planned, checkpoint_count)
    _check(planned, regions, checkpoint_count)
    return planned


def _assign_checkpoints(stages: list[PlannedStage], checkpoint_count: int) -> None:
    sketch = next(s for s in stages if s.kind == "sketch")
    sketch.is_checkpoint = True
    if checkpoint_count == 2:
        # Checkpoint kedua: tahap region terakhir sebelum terang-gelap/detail.
        candidates = [s for s in stages if s.kind in ("medium_regions", "main_object", "background_and_largest")]
        if candidates:
            candidates[-1].is_checkpoint = True


def _union_bbox(boxes: list[list[int]]) -> list[int]:
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return [x0, y0, x1 - x0, y1 - y0]


def _check(stages: list[PlannedStage], regions: list[Region], checkpoint_count: int) -> None:
    """Invarian yang wajib benar; kalau gagal ini bug kode, bukan masalah foto."""
    codes = [c for s in stages for c in s.region_codes]
    assert sorted(codes) == sorted(r.code for r in regions), "setiap region harus dibuka tepat sekali"
    assert [s.order_no for s in stages] == list(range(1, len(stages) + 1))
    assert sum(s.is_checkpoint for s in stages) == min(checkpoint_count, 1 + any(
        s.kind in ("medium_regions", "main_object", "background_and_largest") for s in stages
    ))
    assert stages[0].kind == "preparation" and stages[-1].kind == "finishing"
