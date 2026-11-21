"""Perkiraan campuran cat: cari kombinasi 1–3 cat dengan bagian bulat yang paling mendekati warna target.

- Pencampuran memakai Mixbox (model pigmen Kubelka–Munk; biru + kuning → hijau, bukan abu-abu).
  Lisensi Mixbox CC BY-NC: aman untuk lomba, perlu lisensi untuk penggunaan komersial.
- Selisih warna diukur dengan ΔE2000 (colour-science) di CIELAB D65.
- Resep sederhana diutamakan: campuran 2–3 cat hanya dipilih bila jelas lebih dekat.
- Angka resep berasal dari sini atau dari uji fisik; AI tidak pernah mengubahnya.
"""

import itertools
import warnings
from dataclasses import dataclass, field
from functools import lru_cache
from math import gcd

warnings.filterwarnings("ignore", message=".*Matplotlib.*")  # colour-science: fitur plot tidak dipakai

import colour  # noqa: E402
import mixbox  # noqa: E402
import numpy as np  # noqa: E402

RECIPE_MAX_DE = 3.0  # resep teruji dianggap cocok bila ΔE ≤ 3
ESTIMATE_MAX_DE = 8.0  # di atas ini: "sulit dicapai dengan palet ini"
PENALTY_PER_EXTRA_PAINT = 1.0  # ΔE "biaya" tiap cat tambahan
PENALTY_PER_EXTRA_PART = 0.1


@dataclass(frozen=True)
class Paint:
    id: str
    code: str
    name: str
    hex: str


@dataclass
class Mix:
    components: list[tuple[Paint, int]]  # (cat, bagian), urut dari bagian terbesar
    mixed_hex: str
    delta_e: float
    reachability: str  # recipe | estimate | hard
    recipe_id: str | None = None
    explanation: str = ""
    tips: list[str] = field(default_factory=list)

    def estimate_json(self) -> dict:
        return {
            "components": [{"paint_id": p.id, "paint_code": p.code, "parts": n} for p, n in self.components],
            "mixed_hex": self.mixed_hex,
            "delta_e": round(self.delta_e, 2),
            "tips": self.tips,
        }


# ---------------------------------------------------------------- konversi warna

def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb) -> str:
    r, g, b = (int(np.clip(round(float(v)), 0, 255)) for v in rgb)
    return f"#{r:02X}{g:02X}{b:02X}"


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB 0–255 (…×3) → CIELAB D65."""
    return colour.XYZ_to_Lab(colour.sRGB_to_XYZ(np.asarray(rgb, dtype=float) / 255.0))


def hex_to_lab(h: str) -> np.ndarray:
    return rgb_to_lab(np.array(hex_to_rgb(h)))


def delta_e(lab_a: np.ndarray, lab_b: np.ndarray) -> np.ndarray:
    return colour.delta_E(lab_a, lab_b, method="CIE 2000")


# ---------------------------------------------------------------- tabel campuran per palet

@dataclass
class MixTable:
    paints: tuple[Paint, ...]
    combos: list[tuple[tuple[int, ...], tuple[int, ...]]]
    lab: np.ndarray  # (n_combo, 3)
    rgb: np.ndarray  # (n_combo, 3)
    penalty: np.ndarray  # (n_combo,)


def _ratios(n: int, max_part: int) -> list[tuple[int, ...]]:
    out = []
    for r in itertools.product(range(1, max_part + 1), repeat=n):
        g = 0
        for v in r:
            g = gcd(g, v)
        if g == 1:
            out.append(r)
    return out


# Warna pastel butuh banyak putih (mis. krem ≈ 10 putih : 1 kuning). Uji integrasi Fase 4:
# dengan batas 4 bagian, latar krem #F0E5CE jatuh ke "sulit dicapai" (ΔE 8,8).
TINT_WHITE_PARTS = (5, 6, 8, 10, 12, 16, 20, 24)
PENALTY_PER_EXTRA_PART_TINT = 0.03  # menambah putih itu mudah bagi pemula; jangan dihukum seperti cat lain


@lru_cache(maxsize=8)
def mix_table(paints: tuple[Paint, ...]) -> MixTable:
    """Semua campuran 1 cat, 2 cat (bagian 1–4), 3 cat (bagian 1–3), ditambah campuran "tint"
    (putih 5–24 bagian + 1–2 cat lain sedikit). Disimpan per palet."""
    latents = np.array([mixbox.rgb_to_latent(hex_to_rgb(p.hex)) for p in paints], dtype=float)
    combos: list[tuple[tuple[int, ...], tuple[int, ...]]] = [((i,), (1,)) for i in range(len(paints))]
    for pair in itertools.combinations(range(len(paints)), 2):
        combos += [(pair, r) for r in _ratios(2, 4)]
    for triple in itertools.combinations(range(len(paints)), 3):
        combos += [(triple, r) for r in _ratios(3, 3)]

    whites = [i for i, p in enumerate(paints) if "white" in p.code]
    tint = set()
    for w in whites:
        others = [i for i in range(len(paints)) if i != w]
        for o in others:
            for wp in TINT_WHITE_PARTS:
                combos.append(((w, o), (wp, 1)))
                tint.add(len(combos) - 1)
        for o1, o2 in itertools.combinations(others, 2):
            for wp in TINT_WHITE_PARTS:
                for r in ((1, 1), (2, 1), (1, 2)):
                    combos.append(((w, o1, o2), (wp, *r)))
                    tint.add(len(combos) - 1)

    mixed = np.empty((len(combos), latents.shape[1]))
    for k, (idx, parts) in enumerate(combos):
        w = np.array(parts, dtype=float) / sum(parts)
        mixed[k] = (latents[list(idx)] * w[:, None]).sum(axis=0)
    rgb = np.array([mixbox.latent_to_rgb(list(l)) for l in mixed], dtype=float)
    penalty = np.array([
        PENALTY_PER_EXTRA_PAINT * (len(i) - 1)
        + (PENALTY_PER_EXTRA_PART_TINT if k in tint else PENALTY_PER_EXTRA_PART) * (sum(p) - len(p))
        for k, (i, p) in enumerate(combos)
    ])
    return MixTable(paints, combos, rgb_to_lab(rgb), rgb, penalty)


# ---------------------------------------------------------------- pencarian

def best_mix(target_hex: str, table: MixTable, tested: list[dict] | None = None) -> Mix:
    """Campuran terbaik untuk satu warna. tested = resep teruji palet ini (baris color_recipes kind=tested)."""
    target = hex_to_lab(target_hex)

    for r in tested or []:
        de = float(delta_e(target, np.array(r["target_lab"], dtype=float)))
        if de <= RECIPE_MAX_DE:
            by_id = {p.id: p for p in table.paints}
            comps = [(by_id[c["paint_id"]], int(c["parts"])) for c in r["components"] if c["paint_id"] in by_id]
            mix = Mix(sorted(comps, key=lambda c: -c[1]), r["target_hex"].upper(), de, "recipe", recipe_id=r["id"])
            mix.explanation = explain(mix)
            return mix

    de = delta_e(np.broadcast_to(target, table.lab.shape), table.lab)
    k = int(np.argmin(de + table.penalty))
    idx, parts = table.combos[k]
    comps = sorted(((table.paints[i], p) for i, p in zip(idx, parts)), key=lambda c: -c[1])
    d = float(de[k])
    mix = Mix(comps, rgb_to_hex(table.rgb[k]), d, "estimate" if d <= ESTIMATE_MAX_DE else "hard")
    mix.tips = correction_tips(target, table.lab[k], table.paints)
    mix.explanation = explain(mix)
    return mix


def correction_tips(target_lab: np.ndarray, mixed_lab: np.ndarray, paints: tuple[Paint, ...]) -> list[str]:
    names = {p.code: p.name for p in paints}
    white = next((names[c] for c in names if "white" in c), None)
    dark = next((names[c] for c in names if "black" in c or "umber" in c or "phthalo_blue" in c), None)
    tips = []
    dl = float(mixed_lab[0] - target_lab[0])
    if dl > 4 and dark:
        tips.append(f"Kalau terlalu terang, tambahkan {dark} seujung kuas.")
    elif dl < -4 and white:
        tips.append(f"Kalau terlalu gelap, tambahkan {white} sedikit demi sedikit.")
    chroma_mix = float(np.hypot(mixed_lab[1], mixed_lab[2]))
    chroma_target = float(np.hypot(target_lab[1], target_lab[2]))
    if chroma_mix - chroma_target > 6:
        tips.append("Kalau warnanya terlalu mencolok, redam dengan sedikit warna lawannya atau abu-abu.")
    return tips


def explain(mix: Mix) -> str:
    """Kalimat resep yang ramah pemula. Tidak mengubah angka."""
    if mix.reachability == "recipe":
        lead = "Resep teruji: "
    elif mix.reachability == "estimate":
        lead = "Perkiraan, uji sedikit dulu: "
    else:
        lead = "Sulit dicapai dengan palet ini. Campuran terdekat: "
    c = mix.components
    if len(c) == 1:
        body = f"pakai {c[0][0].name} langsung."
    elif len(c) == 2:
        body = f"mulai dari {c[0][1]} bagian {c[0][0].name}, lalu tambahkan {c[1][1]} bagian {c[1][0].name} sedikit demi sedikit sambil diaduk."
    else:
        body = (
            f"mulai dari {c[0][1]} bagian {c[0][0].name}, tambahkan {c[1][1]} bagian {c[1][0].name}, "
            f"lalu {c[2][1]} bagian {c[2][0].name} sedikit saja."
        )
    tail = " Coba di kertas dan tunggu kering sebelum dipakai." if mix.reachability != "recipe" else ""
    if mix.reachability == "hard":
        tail += " Pertimbangkan cat tambahan bila warnanya penting."
    return lead + body + tail
