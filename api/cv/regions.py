"""Bidang warna (region) dari foto.

Langkah:
1. Kerja di resolusi kecil (sisi panjang 800 px) supaya cepat; koordinat diskalakan ke ukuran penuh.
2. Haluskan dengan filter penjaga tepi (mean shift) agar tekstur kanvas/kertas hilang.
3. k-means di ruang CIELAB (≤ max_colors), warna yang hampir sama digabung.
4. Pecah per pulau (connected components).
5. Region lebih kecil dari luas minimum digabung ke tetangga dengan batas terpanjang
   (bukan dihapus — menghapus meninggalkan lubang).
6. Haluskan batas dengan filter modus, ulangi penggabungan, batasi jumlah region.
7. Ubah tiap region menjadi path SVG (fill-rule evenodd untuk lubang).
"""

from dataclasses import dataclass

import cv2
import numpy as np
from sklearn.cluster import KMeans

from cv.types import Region

WORK_MAX_SIDE = 800
SIMILAR_COLOR_DELTA_E = 6.0  # CIE76; pusat cluster sedekat ini dianggap satu warna


@dataclass
class Segmentation:
    labels: np.ndarray  # int32, ukuran kerja; nilai 0..n-1 sesuai urutan regions
    scale: float  # ukuran penuh / ukuran kerja
    regions: list[Region]
    lab_small: np.ndarray  # LAB float32 ukuran kerja (dipakai layer terang-gelap)


def min_area_fraction(canvas_size: str | None, min_cm2: float = 1.0) -> float:
    """Luas minimum region sebagai pecahan gambar: ±1 cm² pada kertas yang dipilih."""
    areas_cm2 = {"A4": 21.0 * 29.7, "A3": 29.7 * 42.0, "30x40": 30.0 * 40.0}
    return min_cm2 / areas_cm2.get(canvas_size or "A4", areas_cm2["A4"])


def segment(
    img: np.ndarray,
    mask: np.ndarray | None,
    *,
    canvas_size: str | None = "A4",
    max_colors: int = 8,
    max_regions: int = 35,
    seed: int = 0,
) -> Segmentation:
    full_h, full_w = img.shape[:2]
    small = _resize(img, WORK_MAX_SIDE)
    h, w = small.shape[:2]
    scale = full_w / w

    smooth = cv2.pyrMeanShiftFiltering(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), sp=8, sr=18)
    smooth_rgb = cv2.cvtColor(smooth, cv2.COLOR_BGR2RGB)
    lab_smooth = _to_lab(smooth_rgb)
    lab_orig = _to_lab(small)

    clusters = _kmeans_labels(lab_smooth, max_colors, seed)
    labels = _components(clusters)

    min_area = max(4, int(min_area_fraction(canvas_size) * h * w))
    labels = _merge_small(labels, lab_orig, min_area)
    labels = _mode_filter(labels, ksize=5)
    labels = _components(labels)
    labels = _merge_small(labels, lab_orig, min_area)

    labels = _cap_regions(labels, lab_orig, max_regions)

    mask_small = None
    if mask is not None:
        mask_small = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST) > 0

    labels, regions = _describe(labels, lab_orig, mask_small, scale)
    return Segmentation(labels=labels, scale=scale, regions=regions, lab_small=lab_smooth)


# ---------------------------------------------------------------- langkah internal

def _resize(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s >= 1:
        return img.copy()
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def _to_lab(rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 → CIELAB float32 (L 0–100, a/b ±128)."""
    return cv2.cvtColor(rgb.astype(np.float32) / 255.0, cv2.COLOR_RGB2LAB)


def _lab_to_hex(lab: np.ndarray) -> str:
    rgb = cv2.cvtColor(lab.reshape(1, 1, 3).astype(np.float32), cv2.COLOR_LAB2RGB)[0, 0]
    r, g, b = (np.clip(rgb, 0, 1) * 255).round().astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


def _kmeans_labels(lab: np.ndarray, k: int, seed: int) -> np.ndarray:
    h, w = lab.shape[:2]
    pixels = lab.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    sample = pixels[rng.choice(len(pixels), size=min(30000, len(pixels)), replace=False)]
    k = max(1, min(k, len(np.unique(sample.round(1), axis=0))))
    km = KMeans(n_clusters=k, n_init=4, random_state=seed).fit(sample)
    labels = km.predict(pixels).reshape(h, w)

    # Gabung cluster yang warnanya hampir sama.
    centers = km.cluster_centers_
    parent = list(range(k))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(k):
        for j in range(i + 1, k):
            if np.linalg.norm(centers[i] - centers[j]) < SIMILAR_COLOR_DELTA_E:
                parent[find(j)] = find(i)
    lut = np.array([find(i) for i in range(k)])
    return lut[labels].astype(np.int32)


def _components(labels: np.ndarray) -> np.ndarray:
    """Setiap pulau warna jadi region sendiri."""
    out = np.zeros(labels.shape, dtype=np.int32)
    next_id = 0
    for value in np.unique(labels):
        count, comp = cv2.connectedComponents((labels == value).astype(np.uint8), connectivity=4)
        sel = comp > 0
        out[sel] = comp[sel] - 1 + next_id
        next_id += count - 1
    return out


def _border_pairs(labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Pasangan (a, b) region bertetangga dan panjang batasnya (dalam piksel)."""
    a = np.concatenate([labels[:, :-1].ravel(), labels[:-1, :].ravel()])
    b = np.concatenate([labels[:, 1:].ravel(), labels[1:, :].ravel()])
    diff = a != b
    a, b = a[diff], b[diff]
    lo, hi = np.minimum(a, b).astype(np.int64), np.maximum(a, b).astype(np.int64)
    n = int(labels.max()) + 1
    codes, counts = np.unique(lo * n + hi, return_counts=True)
    return np.stack([codes // n, codes % n], axis=1), counts


def _merge_small(labels: np.ndarray, lab: np.ndarray, min_area: int) -> np.ndarray:
    for _ in range(50):
        ids, areas = np.unique(labels, return_counts=True)
        small = ids[areas < min_area]
        if len(small) == 0 or len(ids) == 1:
            break
        pairs, lengths = _border_pairs(labels)
        if len(pairs) == 0:
            break

        n = int(labels.max()) + 1
        area_of = np.zeros(n, dtype=np.int64)
        area_of[ids] = areas
        flat = lab.reshape(-1, 3)
        sums = np.zeros((n, 3))
        np.add.at(sums, labels.ravel(), flat)
        mean_lab = sums / np.maximum(area_of, 1)[:, None]

        # Tetangga dengan batas terpanjang (seri → warna terdekat).
        best: dict[int, tuple[int, float, int]] = {}
        for (p, q), length in zip(pairs, lengths):
            for s, t in ((p, q), (q, p)):
                if area_of[s] >= min_area:
                    continue
                color_dist = float(np.linalg.norm(mean_lab[s] - mean_lab[t]))
                cand = (int(length), -color_dist, int(t))
                if s not in best or cand > best[s]:
                    best[s] = cand

        lut = np.arange(n)
        merged = set()
        for s in sorted(best, key=lambda i: area_of[i]):
            target = best[s][2]
            if target in merged or s in merged:
                continue  # hindari rantai dalam satu putaran; diselesaikan di putaran berikutnya
            lut[s] = target
            merged.add(s)
        if not merged:
            break
        labels = lut[labels].astype(np.int32)
    return _relabel(labels)


def _cap_regions(labels: np.ndarray, lab: np.ndarray, max_regions: int) -> np.ndarray:
    """Jamin jumlah region ≤ max_regions dengan menggabungkan pasangan tetangga yang
    WARNANYA paling mirip (bukan sekadar yang terkecil), supaya bidang yang warnanya
    beda nyata — rok merah, kulit, latar — tetap terpisah.

    Biaya gabung = ΔE76 antar warna rata-rata × faktor ukuran kecil (region kecil lebih murah
    digabung). Tiap putaran menggabungkan pasangan termurah yang tidak saling tumpang tindih.
    """
    labels = _relabel(labels)
    for _ in range(200):
        n = int(labels.max()) + 1
        excess = n - max_regions
        if excess <= 0:
            break
        pairs, lengths = _border_pairs(labels)
        if len(pairs) == 0:
            break
        areas = np.bincount(labels.ravel(), minlength=n).astype(np.float64)
        sums = np.zeros((n, 3))
        np.add.at(sums, labels.ravel(), lab.reshape(-1, 3))
        mean_lab = sums / np.maximum(areas, 1)[:, None]

        p, q = pairs[:, 0], pairs[:, 1]
        delta_e = np.linalg.norm(mean_lab[p] - mean_lab[q], axis=1)
        smaller = np.minimum(areas[p], areas[q]) / areas.sum()
        cost = delta_e * (0.5 + np.sqrt(smaller * 100))  # region kecil sedikit lebih murah

        lut = np.arange(n)
        used: set[int] = set()
        merged = 0
        # Gabung paling banyak setengah kelebihan per putaran agar warna rata-rata diperbarui.
        budget = max(1, (excess + 1) // 2)
        for idx in np.argsort(cost):
            a, b = int(p[idx]), int(q[idx])
            if a in used or b in used:
                continue
            keep, drop = (a, b) if areas[a] >= areas[b] else (b, a)
            lut[drop] = keep
            used.update((a, b))
            merged += 1
            if merged >= budget:
                break
        if merged == 0:
            break
        labels = _relabel(lut[labels])
    return labels


def _relabel(labels: np.ndarray) -> np.ndarray:
    _, inv = np.unique(labels, return_inverse=True)
    return inv.reshape(labels.shape).astype(np.int32)


def _mode_filter(labels: np.ndarray, ksize: int = 5) -> np.ndarray:
    """Haluskan batas: tiap piksel mengambil label mayoritas di sekitarnya."""
    labels = _relabel(labels)
    n = int(labels.max()) + 1
    best_score = np.full(labels.shape, -1.0, dtype=np.float32)
    out = labels.copy()
    for k in range(n):
        score = cv2.boxFilter((labels == k).astype(np.float32), -1, (ksize, ksize), normalize=False)
        better = score > best_score
        out[better] = k
        best_score[better] = score[better]
    return out


def _describe(
    labels: np.ndarray, lab: np.ndarray, mask_small: np.ndarray | None, scale: float
) -> tuple[np.ndarray, list[Region]]:
    h, w = labels.shape
    ids, areas = np.unique(labels, return_counts=True)
    order = ids[np.argsort(-areas)]  # luas terbesar dulu → r01
    remap = np.zeros(int(labels.max()) + 1, dtype=np.int32)
    remap[order] = np.arange(len(order))
    labels = remap[labels]
    codes = [f"r{i + 1:02d}" for i in range(len(order))]

    pairs, _ = _border_pairs(labels)
    neighbors: dict[int, set[int]] = {i: set() for i in range(len(order))}
    for p, q in pairs:
        neighbors[int(p)].add(int(q))
        neighbors[int(q)].add(int(p))

    border_ids = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])).tolist())
    total = h * w
    regions: list[Region] = []
    overlaps: list[float] = []
    for i in range(len(order)):
        sel = labels == i
        area = int(sel.sum())
        ys, xs = np.nonzero(sel)
        mean_lab = lab[sel].mean(axis=0)
        overlap = float(mask_small[sel].mean()) if mask_small is not None else 0.0
        overlaps.append(overlap)
        regions.append(
            Region(
                code=codes[i],
                hex=_lab_to_hex(mean_lab),
                lab=[round(float(v), 1) for v in mean_lab],
                area_pct=round(area / total * 100, 2),
                bbox=[round(xs.min() * scale), round(ys.min() * scale), round((xs.max() - xs.min() + 1) * scale), round((ys.max() - ys.min() + 1) * scale)],
                centroid=[round(xs.mean() * scale), round(ys.mean() * scale)],
                is_main_object=False,
                is_background=False,
                neighbors=sorted(codes[j] for j in neighbors[i]),
                value_level=None,
                path_svg=_region_path(sel, scale),
            )
        )

    if mask_small is not None:
        for i, (r, ov) in enumerate(zip(regions, overlaps)):
            r.is_main_object = ov >= 0.5
            r.is_background = ov < 0.2 and i in border_ids
    else:
        # Cadangan tanpa mask: region besar yang menyentuh tepi = latar;
        # region terbesar yang bukan latar = objek utama.
        for i, r in enumerate(regions):
            r.is_background = i in border_ids and r.area_pct >= 10
        for r in regions:
            if not r.is_background:
                r.is_main_object = True
                break
    return labels, regions


def _region_path(sel: np.ndarray, scale: float) -> str:
    contours, _ = cv2.findContours(sel.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    parts = []
    for c in contours:
        c = cv2.approxPolyDP(c, 0.8, True)
        if len(c) < 3:
            continue
        pts = c.reshape(-1, 2) * scale
        parts.append("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z")
    return " ".join(parts)
