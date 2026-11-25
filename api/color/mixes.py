"""Kelompokkan warna region jadi maksimal 6 CAMPURAN (tutorial bertahap, langkah warna).

Sebelumnya tiap region punya resep sendiri (sampai 35 resep; satu tahap bisa berisi 18 campuran).
Riset (RISET_TUTORIAL.md §4): satu langkah = satu campuran, maks 6 campuran per lukisan (heuristik).

Cara:
1. Warna region tetap dari CV (kualitas region tidak turun).
2. K-means berbobot luas di ruang LAB → maks MAX_MIXES pusat; pusat yang terlalu mirip digabung.
3. Urutan campuran: yang berisi latar dulu (belakang → depan), lalu luas total terbesar.
4. Resep tiap campuran dihitung mixer untuk tiap palet demo (sama seperti region_colors_for).
5. `max_region_delta_e` = selisih terbesar warna asli region vs campurannya (ditampilkan di kartu).
"""

from dataclasses import dataclass, field

import numpy as np

from color.mixer import delta_e

MAX_MIXES = 6
MERGE_DELTA_E = 8.0  # pusat campuran sedekat ini digabung (pemula tidak bisa membedakannya di cat)


@dataclass
class MixGroup:
    mix_id: str
    order_no: int
    target_lab: list[float]
    target_hex: str
    name: str
    region_codes: list[str] = field(default_factory=list)
    max_region_delta_e: float = 0.0
    has_background: bool = False
    area_pct: float = 0.0


def group_regions(regions, max_mixes: int = MAX_MIXES, seed: int = 0) -> list[MixGroup]:
    """regions: list[cv.types.Region]. Return campuran urut tampil; tiap region tepat di satu campuran."""
    if not regions:
        return []
    labs = np.array([r.lab for r in regions], dtype=np.float64)
    weights = np.array([max(r.area_pct, 0.01) for r in regions], dtype=np.float64)
    k = min(max_mixes, len(regions))
    labels = _weighted_kmeans(labs, weights, k, seed)
    labels = _merge_close(labs, weights, labels)

    groups: list[MixGroup] = []
    for g in sorted(set(labels.tolist())):
        idx = np.nonzero(labels == g)[0]
        center = np.average(labs[idx], axis=0, weights=weights[idx])
        members = [regions[i] for i in idx]
        groups.append(MixGroup(
            mix_id="",
            order_no=0,
            target_lab=[round(float(v), 2) for v in center],
            target_hex=lab_to_hex(center),
            name=color_name(center),
            region_codes=[r.code for r in sorted(members, key=lambda r: (not r.is_background, -r.area_pct))],
            max_region_delta_e=round(float(max(delta_e(labs[i], center) for i in idx)), 2),
            has_background=any(r.is_background for r in members),
            area_pct=round(float(weights[idx].sum()), 2),
        ))
    groups.sort(key=lambda g: (not g.has_background, -g.area_pct))
    _disambiguate_names(groups)
    for n, g in enumerate(groups, start=1):
        g.mix_id, g.order_no = f"m{n}", n
    return groups


def region_mix_map(groups: list[MixGroup]) -> dict[str, str]:
    return {code: g.mix_id for g in groups for code in g.region_codes}


def mix_colors_for(groups: list[MixGroup]) -> list[dict]:
    """Resep tiap campuran untuk tiap palet demo → baris `mix_colors` untuk create_lesson."""
    from color.mixer import best_mix, mix_table
    from color.palettes import demo_palettes, paints_of, tested_recipes

    rows = []
    for palette in demo_palettes():
        paints = paints_of(palette)
        if not paints:
            continue
        table = mix_table(paints)
        tested = tested_recipes(palette["id"])
        for g in groups:
            mix = best_mix(g.target_hex, table, tested)
            rows.append({
                "mix_id": g.mix_id,
                "palette_id": palette["id"],
                "recipe_id": mix.recipe_id,
                "estimate": None if mix.recipe_id else mix.estimate_json(),
                "reachability": mix.reachability,
                "explanation": mix.explanation,
            })
    return rows


def to_payload(groups: list[MixGroup]) -> list[dict]:
    return [{"mix_id": g.mix_id, "order_no": g.order_no, "name": g.name, "target_hex": g.target_hex,
             "target_lab": g.target_lab, "max_region_delta_e": g.max_region_delta_e} for g in groups]


# ---------------------------------------------------------------- bantuan

def lab_to_hex(lab) -> str:
    from cv.regions import _lab_to_hex

    return _lab_to_hex(np.asarray(lab, dtype=np.float32))


def color_name(lab) -> str:
    """Nama warna sederhana untuk kartu campuran ("cokelat tua", "biru muda"). Bukan dari AI."""
    lightness, a, b = float(lab[0]), float(lab[1]), float(lab[2])
    chroma = float(np.hypot(a, b))
    if chroma < 10:
        base = "putih" if lightness > 88 else "hitam" if lightness < 18 else "abu-abu"
        if base == "abu-abu" and chroma >= 5:
            base += " kebiruan" if b < 0 else " hangat"
        return base
    hue = (np.degrees(np.arctan2(b, a)) + 360) % 360
    if hue < 35:
        base = "merah" if chroma > 35 else "merah muda" if lightness > 65 else "merah bata"
    elif hue < 70:
        base = "cokelat" if lightness < 60 else "jingga" if chroma > 40 else "krem"
    elif hue < 105:
        base = "kuning" if lightness > 60 else "oker"
    elif hue < 170:
        base = "hijau"
    elif hue < 270:
        base = "biru"
    else:
        base = "ungu"
    if base in ("merah muda", "krem"):
        return base
    if lightness > 72:
        return f"{base} muda"
    if lightness < 35:
        return f"{base} tua"
    return base


def _disambiguate_names(groups: list[MixGroup]) -> None:
    """Nama kembar ("cokelat", "cokelat") diberi pembeda terang/gelap, lalu nomor bila masih kembar."""
    by_name: dict[str, list[MixGroup]] = {}
    for g in groups:
        by_name.setdefault(g.name, []).append(g)
    for name, same in by_name.items():
        if len(same) < 2:
            continue
        same.sort(key=lambda g: -g.target_lab[0])
        labels = ["terang", "gelap"] if len(same) == 2 else ["terang", "sedang", "gelap"] if len(same) == 3 else [str(i + 1) for i in range(len(same))]
        for g, label in zip(same, labels):
            g.name = f"{name} {label}"


def _weighted_kmeans(x: np.ndarray, w: np.ndarray, k: int, seed: int, iters: int = 30) -> np.ndarray:
    """K-means berbobot, inisialisasi deterministik: titik terberat, lalu titik terjauh berbobot."""
    rng = np.random.default_rng(seed)
    centers = [x[int(np.argmax(w))]]
    while len(centers) < k:
        d = np.min([np.linalg.norm(x - c, axis=1) for c in centers], axis=0)
        score = d * np.sqrt(w)
        if score.max() <= 0:
            break
        centers.append(x[int(np.argmax(score + rng.random(len(x)) * 1e-9))])
    c = np.array(centers)
    labels = np.zeros(len(x), dtype=int)
    for _ in range(iters):
        labels = np.argmin(np.linalg.norm(x[:, None, :] - c[None, :, :], axis=2), axis=1)
        new = np.array([np.average(x[labels == j], axis=0, weights=w[labels == j]) if (labels == j).any() else c[j] for j in range(len(c))])
        if np.allclose(new, c):
            break
        c = new
    return labels


def _merge_close(x: np.ndarray, w: np.ndarray, labels: np.ndarray) -> np.ndarray:
    labels = labels.copy()
    while True:
        ids = sorted(set(labels.tolist()))
        if len(ids) < 2:
            return labels
        centers = {j: np.average(x[labels == j], axis=0, weights=w[labels == j]) for j in ids}
        best = min(((delta_e(centers[a], centers[b]), a, b) for i, a in enumerate(ids) for b in ids[i + 1:]), key=lambda t: t[0])
        if best[0] >= MERGE_DELTA_E:
            return labels
        labels[labels == best[2]] = best[1]
