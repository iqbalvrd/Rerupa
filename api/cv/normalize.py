"""Normalisasi foto: decode, potong cakupan, ubah ukuran, encode ulang tanpa metadata."""

import io

import cv2
import numpy as np
from PIL import Image

ANALYSIS_MAX_SIDE = 1600
AI_MAX_SIDE = 1024


def decode_rgb(image_bytes: bytes) -> np.ndarray:
    """Bytes gambar (sudah dibersihkan di unggahan) → array RGB uint8."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        return np.asarray(img.convert("RGB")).copy()


def crop_scope(img: np.ndarray, scope: dict | None) -> np.ndarray:
    """Potong area latihan. scope = {x, y, w, h} dalam pecahan 0–1 dari lebar/tinggi."""
    if not scope:
        return img
    h, w = img.shape[:2]
    x0 = int(round(_clamp(scope["x"]) * w))
    y0 = int(round(_clamp(scope["y"]) * h))
    x1 = int(round(_clamp(scope["x"] + scope["w"]) * w))
    y1 = int(round(_clamp(scope["y"] + scope["h"]) * h))
    if x1 - x0 < 32 or y1 - y0 < 32:
        raise ValueError("cakupan terlalu kecil")
    return img[y0:y1, x0:x1].copy()


def resize_max_side(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale >= 1:
        return img
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return cv2.resize(img, size, interpolation=cv2.INTER_AREA)


def normalize(image_bytes: bytes, scope: dict | None = None, max_side: int = ANALYSIS_MAX_SIDE) -> np.ndarray:
    return resize_max_side(crop_scope(decode_rgb(image_bytes), scope), max_side)


def encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def encode_png(img: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _clamp(v: float) -> float:
    return min(1.0, max(0.0, float(v)))
