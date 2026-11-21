"""Pelurusan foto progres ke ruang koordinat tutorial (PRD §10, Rencana §4.7).

1. Tap 4 sudut (default) → cek bentuk & proporsi → warpPerspective ke ukuran kerja.
2. Penyelarasan halus dengan ECC:
   - utama: terhadap GRID (garis bantu yang digambar pengguna di tahap Persiapan). Grid tidak
     bergantung pada benar-salahnya sketsa, jadi ECC tidak "menghapus" kesalahan posisi pengguna.
   - cadangan (grid tidak terlihat): terhadap garis target, hanya translasi kecil (≤3%).
3. Gagal → alignment failed → needs_retake, tanpa saran geometris.
"""

from dataclasses import dataclass, field
from math import atan2, degrees, hypot

import cv2
import numpy as np

WORK_MAX_SIDE = 800
MIN_QUAD_AREA_FRAC = 0.08  # bidang lukis minimal 8% foto
ASPECT_TOLERANCE = (0.65, 1.55)  # rasio proporsi tap vs tutorial (longgar karena perspektif)
GRID_MAX_SHIFT = 0.06  # koreksi ECC grid maks 6% sisi panjang
GRID_SCALE_RANGE = (0.9, 1.1)
GRID_MAX_ROT_DEG = 5.0
GRID_MIN_COVERAGE = 0.45  # bagian garis grid yang harus tertutup goresan setelah pelurusan
LINES_MAX_SHIFT = 0.03
ECC_CRITERIA = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)


@dataclass
class Alignment:
    ok: bool
    reason: str | None = None  # corners_invalid | aspect_mismatch | not_aligned
    method: str | None = None  # grid | lines
    rectified: np.ndarray | None = None  # RGB, ukuran kerja, sudah dikoreksi ECC
    strokes: np.ndarray | None = None  # goresan gelap (0/1), ukuran kerja, sudah dikoreksi ECC
    correction: dict = field(default_factory=dict)
    grid_coverage: float | None = None


def work_size(width: int, height: int) -> tuple[tuple[int, int], float]:
    """Ukuran kerja (w, h) dan skala dari koordinat tutorial ke koordinat kerja."""
    scale = min(1.0, WORK_MAX_SIDE / max(width, height))
    return (max(1, round(width * scale)), max(1, round(height * scale))), scale


# ---------------------------------------------------------------- sudut

def order_corners(corners: list[float]) -> np.ndarray:
    """8 angka (x1,y1,…) dalam urutan apa pun → 4×2 urut kiri-atas, kanan-atas, kanan-bawah, kiri-bawah."""
    pts = np.array(corners, dtype=np.float64).reshape(4, 2)
    c = pts.mean(axis=0)
    ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    pts = pts[np.argsort(ang)]  # searah jarum jam di koordinat gambar (y ke bawah)
    start = int(np.argmin(pts.sum(axis=1)))  # kiri-atas = x+y terkecil
    return np.roll(pts, -start, axis=0)


def check_corners(quad: np.ndarray, img_w: int, img_h: int, target_w: int, target_h: int) -> str | None:
    """None bila wajar, atau kode alasan."""
    margin = 0.02 * max(img_w, img_h)
    if (quad[:, 0] < -margin).any() or (quad[:, 0] > img_w + margin).any() or (quad[:, 1] < -margin).any() or (quad[:, 1] > img_h + margin).any():
        return "corners_invalid"
    if not cv2.isContourConvex(quad.astype(np.float32).reshape(-1, 1, 2)):
        return "corners_invalid"
    if cv2.contourArea(quad.astype(np.float32)) < MIN_QUAD_AREA_FRAC * img_w * img_h:
        return "corners_invalid"
    tl, tr, br, bl = quad
    w = (hypot(*(tr - tl)) + hypot(*(br - bl))) / 2
    h = (hypot(*(bl - tl)) + hypot(*(br - tr))) / 2
    if min(w, h) < 0.1 * min(img_w, img_h):
        return "corners_invalid"
    ratio = (w / h) / (target_w / target_h)
    if not ASPECT_TOLERANCE[0] <= ratio <= ASPECT_TOLERANCE[1]:
        return "aspect_mismatch"
    return None


def rectify(img: np.ndarray, quad: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    w, h = size
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    return cv2.warpPerspective(img, m, (w, h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)


# ---------------------------------------------------------------- goresan

def extract_strokes(rgb: np.ndarray) -> np.ndarray:
    """Goresan pensil/cat gelap di atas kertas terang → peta 0/1.

    Latar diperkirakan dengan closing (menghapus garis tipis gelap) lalu blur, sehingga
    pencahayaan tidak rata dan bayangan lembut tidak terbaca sebagai garis.
    """
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    k = max(9, (min(gray.shape) // 40) | 1)
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    bg = cv2.GaussianBlur(bg, (0, 0), k / 2)
    ratio = gray / np.maximum(bg, 1.0)
    strokes = (ratio < 0.84).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(strokes, connectivity=8)
    keep = np.zeros(n, dtype=np.uint8)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 12
    out = keep[lab]
    # Tepi bidang (batas kertas/meja, sisa bingkai dari tap sudut) bukan goresan pengguna.
    m = max(4, round(0.015 * max(out.shape)))
    out[:m, :] = 0
    out[-m:, :] = 0
    out[:, :m] = 0
    out[:, -m:] = 0
    return out


def grid_map(size: tuple[int, int], cols: int, rows: int, thickness: int = 2) -> np.ndarray:
    w, h = size
    out = np.zeros((h, w), dtype=np.uint8)
    for i in range(1, cols):
        x = round(w * i / cols)
        cv2.line(out, (x, 0), (x, h - 1), 1, thickness)
    for j in range(1, rows):
        y = round(h * j / rows)
        cv2.line(out, (0, y), (w - 1, y), 1, thickness)
    return out


def grid_band(size: tuple[int, int], cols: int, rows: int, half_width: int) -> np.ndarray:
    """Pita di sekitar garis grid (0/1): goresan di sini dianggap garis bantu, bukan sketsa."""
    return cv2.dilate(grid_map(size, cols, rows, 1), np.ones((2 * half_width + 1, 2 * half_width + 1), np.uint8))


def _ecc_once(template: np.ndarray, moving: np.ndarray, motion: int, sigma: float, warp: np.ndarray) -> np.ndarray | None:
    t = cv2.GaussianBlur(template.astype(np.float32), (0, 0), sigma)
    m = cv2.GaussianBlur(moving.astype(np.float32), (0, 0), sigma)
    if t.std() < 1e-4 or m.std() < 1e-4:
        return None
    try:
        _, out = cv2.findTransformECC(t, m, warp.copy(), motion, ECC_CRITERIA, None, 5)
    except cv2.error:
        return None
    return out


def _ecc(template: np.ndarray, moving: np.ndarray, motion: int) -> np.ndarray | None:
    """ECC kasar → halus. Garis tipis punya daerah tarik sempit; blur besar dulu agar koreksi
    beberapa persen (tap sudut meleset) tetap tertangkap, lalu diperhalus."""
    warp = np.eye(2, 3, dtype=np.float32)
    for sigma, mot in ((12, cv2.MOTION_TRANSLATION), (6, motion), (3, motion)):
        nxt = _ecc_once(template, moving, mot, sigma, warp)
        if nxt is None:
            return None
        warp = nxt
    return warp


def _describe(warp: np.ndarray, size: tuple[int, int]) -> dict:
    a = warp[:, :2]
    long_side = max(size)
    return {
        "tx_pct": round(float(warp[0, 2]) / long_side * 100, 2),
        "ty_pct": round(float(warp[1, 2]) / long_side * 100, 2),
        "scale_x": round(float(np.hypot(a[0, 0], a[1, 0])), 4),
        "scale_y": round(float(np.hypot(a[0, 1], a[1, 1])), 4),
        "rot_deg": round(degrees(atan2(float(a[1, 0]), float(a[0, 0]))), 2),
    }


def _plausible(d: dict) -> bool:
    """Koreksi ECC wajar untuk tap sudut yang sedikit meleset; lebih dari ini kemungkinan salah kunci."""
    return (
        abs(d["tx_pct"]) <= GRID_MAX_SHIFT * 100
        and abs(d["ty_pct"]) <= GRID_MAX_SHIFT * 100
        and all(GRID_SCALE_RANGE[0] <= d[k] <= GRID_SCALE_RANGE[1] for k in ("scale_x", "scale_y"))
        and abs(d["rot_deg"]) <= GRID_MAX_ROT_DEG
    )


def color_edges(rgb: np.ndarray) -> np.ndarray:
    """Besar gradien di ruang LAB (terang + warna), dinormalisasi 0–1: tepi antar-bidang warna."""
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab = cv2.GaussianBlur(lab, (0, 0), 1.5)
    mag = np.zeros(lab.shape[:2], np.float32)
    for c in range(3):
        mag += cv2.magnitude(cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3))
    m = max(1e-6, float(np.percentile(mag, 99)))
    return np.clip(mag / m, 0, 1)


def _apply(img: np.ndarray, warp: np.ndarray, size: tuple[int, int], nearest: bool = False) -> np.ndarray:
    flags = (cv2.INTER_NEAREST if nearest else cv2.INTER_LINEAR) | cv2.WARP_INVERSE_MAP
    return cv2.warpAffine(img, warp, size, flags=flags, borderMode=cv2.BORDER_REPLICATE)


def align(
    img: np.ndarray,
    corners: list[float],
    target_width: int,
    target_height: int,
    target_lines: np.ndarray,
    grid: tuple[int, int],
    target_rgb: np.ndarray | None = None,
) -> Alignment:
    """img = foto progres RGB (orientasi sudah benar). target_lines = garis target (0/1) di ukuran kerja.

    target_rgb (tahap warna): gambar target berwarna di ukuran kerja. Pada tahap warna grid biasanya
    sudah tertutup cat, jadi penyelarasan memakai tepi bidang warna (method "color_edges").
    """
    size, _ = work_size(target_width, target_height)
    quad = order_corners(corners)
    reason = check_corners(quad, img.shape[1], img.shape[0], target_width, target_height)
    if reason:
        return Alignment(False, reason=reason)

    rectified = rectify(img, quad, size)
    strokes = extract_strokes(rectified)
    long_side = max(size)

    # 1) ECC terhadap grid
    gmap = grid_map(size, *grid)
    warp = _ecc(gmap, strokes, cv2.MOTION_AFFINE)
    if warp is not None:
        d = _describe(warp, size)
        if _plausible(d):
            moved = _apply(strokes, warp, size, nearest=True)
            near = cv2.dilate(moved, np.ones((5, 5), np.uint8))
            coverage = float(near[gmap > 0].mean())
            if coverage >= GRID_MIN_COVERAGE:
                return Alignment(True, method="grid", rectified=_apply(rectified, warp, size), strokes=moved, correction=d, grid_coverage=round(coverage, 3))

    # 2) Tahap warna: ECC terhadap tepi bidang warna target
    if target_rgb is not None:
        warp = _ecc(color_edges(target_rgb), color_edges(rectified), cv2.MOTION_AFFINE)
        if warp is not None and _plausible(_describe(warp, size)):
            return Alignment(True, method="color_edges", rectified=_apply(rectified, warp, size), strokes=_apply(strokes, warp, size, nearest=True), correction=_describe(warp, size))

    # 3) Cadangan: ECC translasi kecil terhadap garis target
    warp = _ecc(target_lines, strokes, cv2.MOTION_TRANSLATION)
    if warp is not None and hypot(float(warp[0, 2]), float(warp[1, 2])) <= LINES_MAX_SHIFT * long_side:
        return Alignment(True, method="lines", rectified=_apply(rectified, warp, size), strokes=_apply(strokes, warp, size, nearest=True), correction=_describe(warp, size))

    return Alignment(False, reason="not_aligned", rectified=rectified, strokes=strokes)
