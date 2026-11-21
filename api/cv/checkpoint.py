"""Pipeline CV checkpoint: foto progres → kualitas → pelurusan → metrik → kandidat masalah.

Tidak memanggil AI. Hasilnya dipakai ai/feedback.py (menulis maks 2 saran dari kandidat).
"""

import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from cv import align as al
from cv import compare as cmp
from cv import svgpath
from cv.normalize import decode_rgb, encode_jpeg, resize_max_side

PHOTO_MAX_SIDE = 2000
DARK_MAX = 60.0  # rata-rata kecerahan bidang lukis
BRIGHT_MIN = 252.0
GLARE_MAX_PCT = 8.0
SHARP_MIN = 0.18  # ketajaman tepi goresan (lihat _sharpness); foto tajam ±0,3–0,4


@dataclass
class TargetLesson:
    width: int
    height: int
    regions_svg: str
    sketch_svg: str
    main_object_svg: str | None
    regions: list[cmp.TargetRegion]
    grid: tuple[int, int]


@dataclass
class CheckpointCV:
    image_quality: str  # usable | poor
    alignment: str  # confirmed | failed | not_checked
    needs_retake: bool
    reasons: list[str] = field(default_factory=list)
    retake_code: str | None = None  # photo_unusable | alignment_failed | sketch_not_visible
    alignment_method: str | None = None
    metrics: dict = field(default_factory=dict)
    candidates: list[dict] = field(default_factory=list)
    rectified_jpeg: bytes | None = None
    overlay_jpeg: bytes | None = None  # untuk AI: foto + garis panduan merah + kotak kandidat bernomor
    timings_ms: dict = field(default_factory=dict)


def _sharpness(gray: np.ndarray, strokes: np.ndarray) -> float | None:
    """Rasio gradien maksimum di sekitar goresan terhadap kontrasnya. Foto buram → tepi landai → rasio kecil."""
    near = cv2.dilate(strokes, np.ones((5, 5), np.uint8)) > 0
    if near.sum() < 200:
        return None
    g = gray.astype(np.float32)
    grad = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)) / 8
    contrast = float(np.percentile(g[near], 95) - np.percentile(g[near], 5))
    if contrast < 10:
        return 0.0  # ada goresan tetapi nyaris tanpa kontras: ciri foto sangat buram
    return float(np.percentile(grad[near], 95) / contrast)


FAINT_CONTENT_MIN = 0.03  # kalibrasi sintetis: kertas kosong ±0,014; sketsa sangat buram 0,04–0,10


def _faint_content(rgb: np.ndarray) -> float:
    """Seberapa gelap titik tergelap dibanding kertas di sekitarnya (0 = polos)."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    k = max(9, (min(gray.shape) // 40) | 1)
    bg = cv2.GaussianBlur(cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))), (0, 0), k / 2)
    ratio = gray / np.maximum(bg, 1.0)
    m = max(4, round(0.015 * max(ratio.shape)))
    return 1 - float(np.percentile(ratio[m:-m, m:-m], 0.5))


def _quality(rectified: np.ndarray, strokes: np.ndarray) -> tuple[list[str], dict]:
    gray = cv2.cvtColor(rectified, cv2.COLOR_RGB2GRAY)
    brightness = float(gray.mean())
    glare = float((gray >= 253).mean() * 100)
    sharp = _sharpness(gray, strokes)
    reasons = []
    if brightness < DARK_MAX:
        reasons.append("too_dark")
    if brightness > BRIGHT_MIN:
        reasons.append("too_bright")
    if glare > GLARE_MAX_PCT:
        reasons.append("glare")
    if sharp is not None and sharp < SHARP_MIN:
        reasons.append("blurry")
    return reasons, {"brightness": round(brightness, 1), "glare_pct": round(glare, 2), "sharpness": None if sharp is None else round(sharp, 3)}


PAPER_RGB = (240, 238, 232)


def target_paint_image(labels: np.ndarray, regions: list[cmp.TargetRegion], open_codes: set[str]) -> np.ndarray:
    """Seperti apa bidang seharusnya terlihat di tahap ini: region yang sudah dibuka berwarna, sisanya kertas."""
    colors = np.array([[int(r.hex[i : i + 2], 16) for i in (1, 3, 5)] if r.code in open_codes else PAPER_RGB for r in regions] + [PAPER_RGB], dtype=np.uint8)
    return colors[np.where(labels >= 0, labels, len(regions))]


def _region_boundaries(labels: np.ndarray) -> np.ndarray:
    b = np.zeros(labels.shape, np.uint8)
    b[:, 1:] |= (labels[:, 1:] != labels[:, :-1]).astype(np.uint8)
    b[1:, :] |= (labels[1:, :] != labels[:-1, :]).astype(np.uint8)
    return b


def overlay(rectified: np.ndarray, target_lines: np.ndarray, candidates: list[dict], scale: float) -> np.ndarray:
    out = rectified.copy()
    out[target_lines > 0] = (220, 30, 30)
    for i, c in enumerate(candidates, start=1):
        x, y, w, h = (round(v * scale) for v in c["bbox"])
        cv2.rectangle(out, (x, y), (x + w, y + h), (255, 140, 0), 2)
        cv2.putText(out, str(i), (x + 4, y + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 140, 0), 2, cv2.LINE_AA)
    return out


def run(photo: bytes, corners: list[float], target: TargetLesson, stage_kind: str, open_codes: set[str]) -> CheckpointCV:
    t0 = time.perf_counter()
    timings: dict[str, int] = {}

    def lap(name: str) -> None:
        nonlocal t0
        now = time.perf_counter()
        timings[name] = int((now - t0) * 1000)
        t0 = now

    img = decode_rgb(photo)
    # Sudut dikirim dalam koordinat foto asli; kecilkan foto dan sudutnya bersama-sama.
    small = resize_max_side(img, PHOTO_MAX_SIDE)
    f = small.shape[1] / img.shape[1]
    corners = [float(c) * f for c in corners]

    size, scale = al.work_size(target.width, target.height)
    target_lines = svgpath.stroke_map(target.sketch_svg, size, scale, thickness=2)
    lap("prepare")

    codes = [r.code for r in target.regions]
    labels = svgpath.region_labels(target.regions_svg, codes, size, scale)
    target_rgb = None if stage_kind == "sketch" else target_paint_image(labels, target.regions, open_codes)
    a = al.align(small, corners, target.width, target.height, target_lines, target.grid, target_rgb)
    lap("align")
    if a.reason in ("corners_invalid", "aspect_mismatch"):
        return CheckpointCV("usable", "failed", True, [a.reason], "alignment_failed", timings_ms=timings)

    rectified = a.rectified
    reasons, qmetrics = _quality(rectified, a.strokes)
    if reasons:
        return CheckpointCV("poor", "not_checked", True, reasons, "photo_unusable", metrics={"quality": qmetrics}, timings_ms=timings)
    if not a.ok:
        if qmetrics["sharpness"] is None and _faint_content(rectified) > FAINT_CONTENT_MIN:
            # Goresan tidak terbaca, tetapi ada bayangan samar di bidang: ciri foto sangat buram.
            return CheckpointCV("poor", "not_checked", True, ["blurry"], "photo_unusable", metrics={"quality": qmetrics}, timings_ms=timings)
        if qmetrics["sharpness"] is None:
            # Hampir tidak ada garis/goresan di bidang: kertas masih kosong, atau goresan terlalu tipis.
            code = "sketch_not_visible" if stage_kind == "sketch" else "progress_not_visible"
            return CheckpointCV("usable", "not_checked", True, [code], code, metrics={"quality": qmetrics}, timings_ms=timings)
        if qmetrics["sharpness"] < SHARP_MIN * 1.3:
            # Garis ada tetapi tidak tajam: kemungkinan besar buram, bukan salah tap sudut.
            return CheckpointCV("poor", "not_checked", True, ["blurry"], "photo_unusable", metrics={"quality": qmetrics}, timings_ms=timings)
        return CheckpointCV("usable", "failed", True, [a.reason or "not_aligned"], "alignment_failed", metrics={"quality": qmetrics}, timings_ms=timings)

    band = al.grid_band(size, *target.grid, half_width=max(3, round(0.006 * max(size))))
    main_mask = svgpath.filled_mask(target.main_object_svg, size, scale) if target.main_object_svg else None
    lap("target")

    if stage_kind == "sketch":
        comp = cmp.compare_sketch(a.strokes, labels, target.regions, main_mask, target_lines, band, scale)
    else:
        comp = cmp.compare_paint(rectified, labels, target.regions, open_codes, scale)
    lap("compare")

    metrics = {"quality": qmetrics, "alignment": {"method": a.method, **a.correction, "grid_coverage": a.grid_coverage}, **comp.metrics}
    if not comp.visible:
        return CheckpointCV("usable", "confirmed", True, ["sketch_not_visible"], "sketch_not_visible", a.method, metrics, timings_ms=timings)
    return CheckpointCV(
        "usable", "confirmed", False, [], None, a.method, metrics, comp.candidates,
        rectified_jpeg=encode_jpeg(rectified, 85),
        overlay_jpeg=encode_jpeg(overlay(rectified, target_lines if stage_kind == "sketch" else _region_boundaries(labels), comp.candidates, scale), 85),
        timings_ms=timings,
    )
