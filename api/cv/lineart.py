"""Garis sketsa dari foto lukisan.

Metode (dipilih lewat LINEART_METHOD, dibandingkan di eval/):
- model : Informative Drawings (controlnet_aux LineartDetector) — kontur bersih
- teed  : TEED — detektor tepi kecil, cadangan ringan
- xdog  : eXtended Difference of Gaussians — klasik, tanpa model
- canny : Canny setelah filter penjaga tepi — paling sederhana

Semua metode menghasilkan peta garis float 0–1 (1 = garis) berukuran sama dengan gambar,
lalu dibersihkan: ambang → buang komponen pendek (tekstur kanvas/serat) → PNG transparan.
"""

import cv2
import numpy as np
from PIL import Image

from cv.models import lineart_detector, teed_detector

METHODS = ("model", "teed", "xdog", "canny")
LINE_RGB = (30, 30, 30)


def edge_map(img: np.ndarray, method: str) -> np.ndarray:
    if method not in METHODS:
        raise ValueError(f"metode garis tidak dikenal: {method}")
    h, w = img.shape[:2]
    if method in ("model", "teed"):
        import torch

        # Tanpa gradien: hemat ±500 MB aktivasi di CPU.
        with torch.inference_mode():
            return _model_edge_map(img, method, h, w)
    if method == "xdog":
        return xdog(img)
    return canny(img)


def _model_edge_map(img: np.ndarray, method: str, h: int, w: int) -> np.ndarray:
    if method == "model":
        res = min(1024, max(h, w))
        out = lineart_detector()(Image.fromarray(img), coarse=False, detect_resolution=res, image_resolution=res)
        edges = _to_float_map(out, (w, h))
    elif method == "teed":
        res = min(1024, max(h, w))
        out = teed_detector()(Image.fromarray(img), detect_resolution=res)
        edges = _to_float_map(out, (w, h))
    return edges


def _to_float_map(pil_img: Image.Image, size: tuple[int, int]) -> np.ndarray:
    arr = np.asarray(pil_img.convert("L").resize(size, Image.BILINEAR), dtype=np.float32) / 255.0
    # Pastikan 1 = garis: peta garis didominasi latar, jadi rata-rata harus kecil.
    if arr.mean() > 0.5:
        arr = 1.0 - arr
    return arr


def xdog(img: np.ndarray, sigma: float = 1.0, k: float = 1.6, tau: float = 0.98, eps: float = -0.01, phi: float = 100.0) -> np.ndarray:
    """Parameter dikalibrasi untuk gambar skala 0–1 (uji sintetis: tepi tertangkap, latar polos bersih)."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    gray = cv2.bilateralFilter(gray, 7, 0.1, 5)
    g1 = cv2.GaussianBlur(gray, (0, 0), sigma)
    g2 = cv2.GaussianBlur(gray, (0, 0), sigma * k)
    d = g1 - tau * g2
    soft = np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
    return np.clip(1.0 - soft, 0.0, 1.0).astype(np.float32)


def canny(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 50, 9)
    median = float(np.median(gray))
    lo, hi = int(max(0, 0.66 * median)), int(min(255, 1.33 * median))
    return (cv2.Canny(gray, lo, hi) > 0).astype(np.float32)


TARGET_DENSITY_PCT = 4.0  # % piksel garis yang dituju; dikalibrasi dari evaluasi foto nyata
MIN_THRESHOLD = 0.08


def adaptive_threshold(edges: np.ndarray, target_density_pct: float = TARGET_DENSITY_PCT) -> float:
    """Ambang yang membuat ±target_density_pct piksel menjadi garis.

    Ambang tetap tidak bisa dipakai lintas metode/foto: di uji foto nyata XDoG hampir kosong
    dan TEED menutupi >50% gambar dengan ambang yang sama. Batas bawah mencegah noise
    dianggap garis pada gambar yang hampir polos.
    """
    return max(MIN_THRESHOLD, float(np.percentile(edges, 100 - target_density_pct)))


def clean_lines(edges: np.ndarray, threshold: float | None = None, min_length_px: int | None = None) -> np.ndarray:
    """Ambang (adaptif bila None) lalu buang komponen garis kecil (bintik tekstur). Return biner uint8 0/255."""
    h, w = edges.shape
    if min_length_px is None:
        min_length_px = max(12, round(max(h, w) * 0.012))  # ±20 px pada 1600 px
    if threshold is None:
        threshold = adaptive_threshold(edges)
    binary = (edges >= threshold).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = np.zeros(count, dtype=bool)
    for i in range(1, count):
        bw, bh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        if max(bw, bh) >= min_length_px:
            keep[i] = True
    return (keep[labels] * 255).astype(np.uint8)


def lines_png(binary: np.ndarray) -> np.ndarray:
    """Garis gelap di atas latar transparan (RGBA), siap ditumpuk di SVG."""
    h, w = binary.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = LINE_RGB
    rgba[..., 3] = binary
    return rgba


def line_stats(binary: np.ndarray) -> dict:
    """Ukuran kebersihan garis untuk evaluasi: kepadatan dan jumlah segmen per megapiksel."""
    h, w = binary.shape
    count, _, _, _ = cv2.connectedComponentsWithStats((binary > 0).astype(np.uint8), connectivity=8)
    mp = h * w / 1e6
    return {"density_pct": round(float((binary > 0).mean() * 100), 2), "segments_per_mp": round((count - 1) / mp, 1)}
