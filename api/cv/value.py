"""Layer terang-gelap: kecerahan (L* CIELAB) dibagi 3–5 tingkat dengan koordinat yang sama.

Hanya ditampilkan bila use_shading = true (karya bervolume, mis. Raden Saleh).
Karya garis dan bidang datar (Kamasan, wayang) tidak mendapat layer ini.
"""

import cv2
import numpy as np

from cv.regions import Segmentation, _components, _merge_small, _mode_filter, _region_path, min_area_fraction

GRAYS = {3: ["#3A3A3A", "#8C8C8C", "#E0E0E0"], 4: ["#333333", "#707070", "#ADADAD", "#E6E6E6"], 5: ["#2E2E2E", "#5E5E5E", "#8F8F8F", "#BFBFBF", "#EBEBEB"]}


def value_levels(seg: Segmentation, levels: int = 4) -> np.ndarray:
    """Peta tingkat 0..levels-1 (0 = paling gelap) ukuran kerja."""
    if levels not in GRAYS:
        raise ValueError("levels harus 3, 4, atau 5")
    lightness = cv2.GaussianBlur(seg.lab_small[..., 0], (0, 0), 2.0)
    # Batas tingkat dibagi rata di rentang kecerahan nyata (persentil 2–98), bukan per kuantil:
    # kuantil membesar-besarkan noise di area polos sehingga latar rata pecah jadi bercak.
    lo, hi = np.percentile(lightness, [2, 98])
    if hi - lo < 1e-3:
        return np.zeros(lightness.shape, dtype=np.int32)
    edges = np.linspace(lo, hi, levels + 1)[1:-1]
    quant = _mode_filter(np.digitize(lightness, edges).astype(np.int32), ksize=7)
    return _remove_specks(quant, seg)


def _remove_specks(quant: np.ndarray, seg: Segmentation) -> np.ndarray:
    """Pulau tingkat yang sangat kecil (bintik tekstur) digabung ke tetangga, lalu tiap pulau
    kembali ke tingkat mayoritasnya."""
    min_area = max(4, int(min_area_fraction("A4") * quant.size))
    comps = _merge_small(_components(quant), seg.lab_small, min_area)
    out = np.zeros_like(quant)
    for c in np.unique(comps):
        sel = comps == c
        out[sel] = int(np.bincount(quant[sel]).argmax())
    return out


def assign_region_levels(seg: Segmentation, quant: np.ndarray) -> None:
    """Isi Region.value_level (1 = paling gelap) dari tingkat mayoritas di dalam region."""
    for i, region in enumerate(seg.regions):
        values = quant[seg.labels == i]
        region.value_level = int(np.bincount(values).argmax()) + 1 if values.size else None


def value_svg_body(seg: Segmentation, quant: np.ndarray) -> str:
    levels = int(quant.max()) + 1
    palette = GRAYS.get(levels, GRAYS[4])
    parts = []
    for k in range(levels):
        path = _region_path(quant == k, seg.scale)
        if path:
            parts.append(f'<path data-level="{k + 1}" fill="{palette[k]}" d="{path}"/>')
    return "".join(parts)


def shading_hint(seg: Segmentation) -> float:
    """0–1: seberapa bergradasi isi tiap region. Karya bidang datar → kecil; bervolume → besar."""
    lightness = seg.lab_small[..., 0]
    stds = []
    weights = []
    for i, region in enumerate(seg.regions):
        values = lightness[seg.labels == i]
        if values.size > 50:
            stds.append(float(values.std()))
            weights.append(values.size)
    if not stds:
        return 0.0
    mean_std = float(np.average(stds, weights=weights))
    return float(np.clip((mean_std - 3.0) / 9.0, 0.0, 1.0))
