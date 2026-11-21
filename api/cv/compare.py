"""Membandingkan foto progres (sudah diluruskan) dengan target tahap checkpoint → kandidat masalah.

Cakupan versi awal (PRD §10): posisi relatif, ukuran bentuk besar, area yang belum terisi.
Penilaian rona halus dan teknik sapuan TIDAK dinilai.

- Tahap sketsa : untuk tiap bentuk besar (region ≥2% + siluet objek utama) diukur seberapa banyak
                 garis luarnya sudah digambar (recall dalam toleransi), lalu dari pergeseran goresan
                 terdekat per sisi (median, tahan derau): bergeser, terlalu lebar/sempit, terlalu
                 tinggi/pendek. Siluet dibandingkan lewat garis luarnya, bukan IoU isian: goresan
                 sketsa jarang tertutup rapat sehingga isian otomatis tidak andal.
- Tahap warna  : % terisi dan selisih terang (ΔL*) per region yang sudah dibuka.

Kandidat diurutkan dari masalah terbesar (bobot luas bentuk); maks 3 dikirim ke penulis feedback.
AI hanya boleh memilih dari kandidat ini.
"""

from dataclasses import dataclass, field

import cv2
import numpy as np
from scipy import ndimage

SKETCH_MIN_AREA_PCT = 2.0  # sama dengan render.sketch_svg: hanya bentuk besar yang digambar di sketsa
TOL_FRAC = 0.02  # garis dianggap pas bila ≤2% sisi panjang dari target
FAR_FRAC = 0.10  # goresan ≤10% dianggap "garis yang dimaksud, tetapi bergeser"
MISSING_RECALL = 0.4
SHIFT_MIN = 0.025  # 2,5% sisi panjang
SIZE_MIN = 0.10  # 10% lebar/tinggi bentuk
MIN_STROKE_PCT = 0.15  # di bawah ini sketsa dianggap belum terlihat di foto
UNFILLED_MAX = 0.7
DL_MAX = 15.0
MAX_CANDIDATES = 3
MIN_SCORE = 0.02
MAIN = "main"  # kode semu untuk siluet objek utama


@dataclass
class TargetRegion:
    code: str
    hex: str
    area_pct: float
    is_background: bool
    is_main_object: bool


@dataclass
class Comparison:
    visible: bool
    metrics: dict = field(default_factory=dict)
    candidates: list[dict] = field(default_factory=list)


def location_words(bbox_work: tuple[int, int, int, int], size: tuple[int, int]) -> str:
    x, y, w, h = bbox_work
    cx, cy = (x + w / 2) / size[0], (y + h / 2) / size[1]
    col = "kiri" if cx < 1 / 3 else "kanan" if cx > 2 / 3 else "tengah"
    row = "atas" if cy < 1 / 3 else "bawah" if cy > 2 / 3 else "tengah"
    if col == row == "tengah":
        return "tengah"
    if row == "tengah":
        return f"{col}"
    if col == "tengah":
        return f"{row}"
    return f"{col} {row}"


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    return int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)


def _boundary(mask: np.ndarray, border: int = 3) -> np.ndarray:
    inner = cv2.erode(mask, np.ones((3, 3), np.uint8))
    b = (mask > 0) & (inner == 0)
    b[:border, :] = b[-border:, :] = False
    b[:, :border] = b[:, -border:] = False
    return b


def _to_lesson_bbox(b: tuple[int, int, int, int], scale: float) -> list[int]:
    return [round(v / scale) for v in b]


# ---------------------------------------------------------------- sketsa

def _shape_metrics(mask: np.ndarray, dist: np.ndarray, near_y: np.ndarray, near_x: np.ndarray, ignore: np.ndarray, tol: float, far: float) -> dict | None:
    pts = _boundary(mask) & (ignore == 0)
    ys, xs = np.nonzero(pts)
    if len(ys) < 20:
        return None
    if len(ys) > 1500:
        sel = np.linspace(0, len(ys) - 1, 1500).astype(int)
        ys, xs = ys[sel], xs[sel]
    d = dist[ys, xs]
    out = {
        "points": int(len(ys)),
        "recall": round(float((d <= tol).mean()), 3),
        "recall_far": round(float((d <= far).mean()), 3),
    }
    matched = d <= far
    dx = (near_x[ys, xs] - xs).astype(float)
    dy = (near_y[ys, xs] - ys).astype(float)
    cy, cx = ys.mean(), xs.mean()
    vx, vy = xs - cx, ys - cy
    norm = np.hypot(vx, vy) + 1e-6
    cos, sin = vx / norm, vy / norm
    sides = {"left": cos < -0.7, "right": cos > 0.7, "top": sin < -0.7, "bottom": sin > 0.7}
    med = {}
    for name, sel in sides.items():
        m = sel & matched
        if m.sum() >= 8:
            med[name] = float(np.median(dx[m] if name in ("left", "right") else dy[m]))
    out["side_offsets_px"] = {k: round(v, 1) for k, v in med.items()}
    return out


def _dominant_side(a: float, b: float, name_a: str, name_b: str) -> str:
    """Sisi yang paling berbeda; bila keduanya mirip besar → 'kedua sisi'."""
    lo, hi = sorted((abs(a), abs(b)))
    if hi == 0 or lo / hi >= 0.6:
        return "kedua sisi"
    return name_a if abs(a) > abs(b) else name_b


def _sketch_candidate(code: str, m: dict, bbox: tuple[int, int, int, int], long_side: int) -> dict | None:
    """Satu kandidat (masalah terkuat) per bentuk."""
    missing = {"region_code": code, "kind": "missing_outline", "severity": round(1 - m["recall"], 3), "facts": {"drawn_pct": round(m["recall"] * 100)}}
    if m["recall_far"] < MISSING_RECALL:
        return missing
    s = m["side_offsets_px"]
    options = []
    if "left" in s and "right" in s:
        change = (s["right"] - s["left"]) / max(bbox[2], 1)
        if abs(change) >= SIZE_MIN:
            side = _dominant_side(s["left"], s["right"], "kiri", "kanan")
            options.append({"kind": "too_wide" if change > 0 else "too_narrow", "severity": abs(change), "facts": {"change_pct": round(change * 100), "side": side}})
        shift_x = (s["left"] + s["right"]) / 2 / long_side
    else:
        shift_x = 0.0
    if "top" in s and "bottom" in s:
        change = (s["bottom"] - s["top"]) / max(bbox[3], 1)
        if abs(change) >= SIZE_MIN:
            side = _dominant_side(s["top"], s["bottom"], "atas", "bawah")
            options.append({"kind": "too_tall" if change > 0 else "too_short", "severity": abs(change), "facts": {"change_pct": round(change * 100), "side": side}})
        shift_y = (s["top"] + s["bottom"]) / 2 / long_side
    else:
        shift_y = 0.0
    mag = float(np.hypot(shift_x, shift_y))
    if mag >= SHIFT_MIN:
        horiz = "kanan" if shift_x > 0 else "kiri"
        vert = "bawah" if shift_y > 0 else "atas"
        if abs(shift_x) >= 2 * abs(shift_y):
            direction = horiz
        elif abs(shift_y) >= 2 * abs(shift_x):
            direction = vert
        else:
            direction = f"{horiz} {vert}"
        options.append({"kind": "shifted", "severity": mag / 0.05, "facts": {"direction": direction, "shift_pct": round(mag * 100, 1)}})
    if not options:
        # Garisnya tidak pas tetapi juga tidak bergeser/berubah ukuran secara konsisten.
        return missing if m["recall"] < MISSING_RECALL else None
    best = max(options, key=lambda o: o["severity"])
    return {"region_code": code, **best, "severity": round(best["severity"], 3)}


def compare_sketch(
    strokes: np.ndarray,
    labels: np.ndarray,
    regions: list[TargetRegion],
    main_mask: np.ndarray | None,
    target_lines: np.ndarray,
    grid_ignore: np.ndarray,
    scale: float,
) -> Comparison:
    h, w = strokes.shape
    size = (w, h)
    long_side = max(size)
    tol, far = TOL_FRAC * long_side, FAR_FRAC * long_side

    user = strokes.copy()
    user[grid_ignore > 0] = 0
    stroke_pct = float(user.mean() * 100)
    if stroke_pct < MIN_STROKE_PCT:
        return Comparison(False, {"stroke_pct": round(stroke_pct, 3)})

    dist, (near_y, near_x) = ndimage.distance_transform_edt(user == 0, return_indices=True)
    tgt = (target_lines > 0) & (grid_ignore == 0)
    line_recall = float((dist[tgt] <= tol).mean()) if tgt.any() else 0.0
    dist_t = ndimage.distance_transform_edt(target_lines == 0)
    precision = float((dist_t[user > 0] <= far).mean())

    metrics: dict = {
        "stroke_pct": round(stroke_pct, 3),
        "line_recall": round(line_recall, 3),
        "stroke_precision": round(precision, 3),
        "shapes": {},
    }
    candidates = []
    shapes: list[tuple[str, np.ndarray, float, bool]] = []
    if main_mask is not None and main_mask.any():
        shapes.append((MAIN, main_mask.astype(np.uint8), float(main_mask.mean() * 100), True))
    for i, r in enumerate(regions):
        if r.area_pct >= SKETCH_MIN_AREA_PCT and not r.is_background:
            m = (labels == i).astype(np.uint8)
            if not m.any():
                continue
            if main_mask is not None and main_mask.any():
                inter = float(((m > 0) & (main_mask > 0)).sum())
                if inter / float(((m > 0) | (main_mask > 0)).sum()) > 0.8:
                    continue  # region ini praktis sama dengan siluet objek utama → cukup dinilai sekali
            shapes.append((r.code, m, r.area_pct, False))

    for code, mask, area_pct, is_main in shapes:
        m = _shape_metrics(mask, dist, near_y, near_x, grid_ignore, tol, far)
        if m is None:
            continue
        bbox = _bbox(mask)
        metrics["shapes"][code] = m
        c = _sketch_candidate(code, m, bbox, long_side)
        if c:
            weight = np.sqrt(area_pct / 100) * (1.5 if is_main else 1.0)
            c["score"] = round(float(c["severity"] * weight), 4)
            c["bbox"] = _to_lesson_bbox(bbox, scale)
            c["location"] = location_words(bbox, size)
            candidates.append(c)

    visible = line_recall > 0.05 or precision > 0.3
    if not visible:
        return Comparison(False, metrics)
    return Comparison(True, metrics, _top(candidates))


# ---------------------------------------------------------------- tahap warna

def _hex_l(hex_: str) -> float:
    rgb = np.array([[[int(hex_[i : i + 2], 16) for i in (1, 3, 5)]]], dtype=np.uint8)
    return float(cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[0, 0, 0]) * 100 / 255


def compare_paint(rectified: np.ndarray, labels: np.ndarray, regions: list[TargetRegion], open_codes: set[str], scale: float) -> Comparison:
    h, w = labels.shape
    size = (w, h)
    lab = cv2.cvtColor(rectified, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0] * 100 / 255
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)

    open_idx = [i for i, r in enumerate(regions) if r.code in open_codes]
    closed_sel = np.isin(labels, [i for i in range(len(regions)) if i not in open_idx])
    paper = float(np.percentile(L[closed_sel], 90)) if closed_sel.mean() > 0.05 else float(np.percentile(L, 97))
    paper = max(paper, 40.0)
    L_corr = L * 95.0 / paper  # kertas/kanvas dianggap L*≈95
    unpainted = (np.abs(L - paper) < 6) & (chroma < 8)

    erode = np.ones((max(3, int(TOL_FRAC * max(size)) | 1),) * 2, np.uint8)
    metrics: dict = {"paper_l": round(paper, 1), "regions": {}}
    candidates = []
    for i in open_idx:
        r = regions[i]
        if r.area_pct < 0.5:
            continue
        mask = cv2.erode((labels == i).astype(np.uint8), erode) > 0
        if mask.sum() < 30:
            continue
        fill = 1 - float(unpainted[mask].mean())
        painted = mask & ~unpainted
        dl = float(np.median(L_corr[painted]) - _hex_l(r.hex)) if painted.sum() >= 30 else None
        metrics["regions"][r.code] = {"fill_pct": round(fill * 100, 1), "delta_l": None if dl is None else round(dl, 1)}
        bbox = _bbox(mask)
        options = []
        if fill < UNFILLED_MAX:
            options.append({"kind": "unfilled", "severity": 1 - fill, "facts": {"fill_pct": round(fill * 100)}})
        if dl is not None and abs(dl) > DL_MAX:
            options.append({"kind": "too_light" if dl > 0 else "too_dark", "severity": abs(dl) / 30, "facts": {"delta_l": round(dl)}})
        if options:
            best = max(options, key=lambda o: o["severity"])
            candidates.append({
                "region_code": r.code, **best, "severity": round(best["severity"], 3),
                "score": round(best["severity"] * float(np.sqrt(r.area_pct / 100)), 4),
                "bbox": _to_lesson_bbox(bbox, scale), "location": location_words(bbox, size),
            })
    return Comparison(True, metrics, _top(candidates))


def _top(candidates: list[dict]) -> list[dict]:
    kept = [c for c in candidates if c["score"] >= MIN_SCORE]
    return sorted(kept, key=lambda c: -c["score"])[:MAX_CANDIDATES]
