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

from cv.models import lineart_detector, teed_detector, teed_onnx

METHODS = ("model", "teed", "xdog", "canny")
LINE_RGB = (30, 30, 30)


def edge_map(img: np.ndarray, method: str) -> np.ndarray:
    if method not in METHODS:
        raise ValueError(f"metode garis tidak dikenal: {method}")
    h, w = img.shape[:2]
    if method == "teed" and teed_onnx() is not None:
        return _model_edge_map(img, method, h, w)  # onnxruntime, tanpa torch (worker RAM 1 GB)
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
        out = Image.fromarray(_teed_tiled(img, res))
        edges = _to_float_map(out, (w, h))
    return edges


TEED_TILE = 512
TEED_OVERLAP = 64


def _tile_starts(n: int, tile: int, step: int) -> list[int]:
    if n <= tile:
        return [0]
    starts = list(range(0, n - tile, step))
    starts.append(n - tile)
    return starts


def _resize_short_side(img: np.ndarray, resolution: int) -> np.ndarray:
    """Sama dengan controlnet_aux.util.resize_image: sisi pendek → resolution, kelipatan 64."""
    h, w = img.shape[:2]
    k = float(resolution) / min(h, w)
    nh, nw = int(np.round(h * k / 64.0)) * 64, int(np.round(w * k / 64.0)) * 64
    return cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LANCZOS4 if k > 1 else cv2.INTER_AREA)


def _safe_step(x: np.ndarray, step: int = 2) -> np.ndarray:
    y = x.astype(np.float32) * float(step + 1)
    return y.astype(np.int32).astype(np.float32) / float(step)


def _teed_runner():
    """Fungsi petak (h, w, 3) float32 → peta tepi (h, w) sebelum sigmoid: rata-rata keluaran TEED."""
    session = teed_onnx()
    if session is not None:
        name = session.get_inputs()[0].name
        return lambda patch: session.run(None, {name: patch.transpose(2, 0, 1)[None]})[0][0, 0]

    import torch

    model = teed_detector().model

    def run(patch: np.ndarray) -> np.ndarray:
        th, tw = patch.shape[:2]
        outs = model(torch.from_numpy(patch).permute(2, 0, 1)[None])
        return np.mean([cv2.resize(o[0, 0].numpy().astype(np.float32), (tw, th)) for o in outs], axis=0)

    return run


def _teed_tiled(img: np.ndarray, res: int) -> np.ndarray:
    """Sama dengan TEEDdetector(img, detect_resolution=res), tetapi model dijalankan per petak 512 px.
    Sisi pendek diskalakan ke `res` (foto 1600 px → ±1600×1024), dan sekali jalan butuh +880 MB;
    per petak cukup ±200 MB dengan hasil identik (uji foto koleksi: beda rata-rata 0/255)."""
    run = _teed_runner()
    x = _resize_short_side(img, res).astype(np.float32)
    hh, ww = x.shape[:2]
    acc = np.zeros((hh, ww), np.float32)
    margin = TEED_OVERLAP // 2
    th, tw = min(TEED_TILE, hh), min(TEED_TILE, ww)
    for y0 in _tile_starts(hh, th, th - TEED_OVERLAP):
        for x0 in _tile_starts(ww, tw, tw - TEED_OVERLAP):
            e = run(np.ascontiguousarray(x[y0 : y0 + th, x0 : x0 + tw]))
            ya = margin if y0 > 0 else 0
            yb = th - margin if y0 + th < hh else th
            xa = margin if x0 > 0 else 0
            xb = tw - margin if x0 + tw < ww else tw
            acc[y0 + ya : y0 + yb, x0 + xa : x0 + xb] = e[ya:yb, xa:xb]
    edge = 1 / (1 + np.exp(-acc.astype(np.float64)))
    edge = (_safe_step(edge, 2) * 255.0).clip(0, 255).astype(np.uint8)
    return cv2.resize(edge, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)


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


def clean_lines(edges: np.ndarray, threshold: float | None = None, min_length_px: int | None = None, thin: bool = True) -> np.ndarray:
    """Ambang (adaptif bila None), buang komponen garis kecil (bintik tekstur), lalu tipiskan.
    Return biner uint8 0/255."""
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
    binary = keep[labels].astype(np.uint8)
    if thin:
        binary = thin_lines(binary)
    return binary * 255


def stroke_width(h: int, w: int) -> int:
    """Tebal garis seragam: 3 px pada foto 1600 px, minimal 2 px (tetap terlihat saat diperkecil di HP)."""
    return max(2, round(max(h, w) / 600))


def thin_lines(binary: np.ndarray) -> np.ndarray:
    """Garis tebal/menggumpal (khas TEED di mata, tangan) → kerangka 1 px → dipertebal seragam.
    Detail tetap, tetapi tidak lagi tampak seperti coretan spidol."""
    from skimage.morphology import skeletonize

    skeleton = skeletonize(binary > 0).astype(np.uint8)
    width = stroke_width(*binary.shape)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (width, width))
    return cv2.dilate(skeleton, kernel)


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
