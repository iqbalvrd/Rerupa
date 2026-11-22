"""Mask objek utama dengan rembg. Mengembalikan None bila hasilnya tidak bisa dipercaya
(mis. lukisan ramai tanpa objek tunggal) — pemanggil memakai cadangan."""

import cv2
import numpy as np
from PIL import Image

from cv.models import rembg_session

MIN_COVERAGE = 0.03
MAX_COVERAGE = 0.95


def main_object_mask(img: np.ndarray, model: str = "isnet-general-use") -> np.ndarray | None:
    """Mask biner uint8 (0/255) ukuran sama dengan img, atau None bila tidak andal."""
    raw = rembg_session(model).mask(Image.fromarray(img))
    mask = np.asarray(raw.convert("L"))
    if mask.shape != img.shape[:2]:
        mask = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    return clean_mask(mask)


def clean_mask(mask: np.ndarray) -> np.ndarray | None:
    """Ambang, ambil komponen terbesar, isi lubang, haluskan. None bila cakupan tidak masuk akal."""
    binary = (mask >= 128).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 1:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    binary = (labels == largest).astype(np.uint8) * 255

    binary = fill_holes(binary)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    coverage = float((binary > 0).mean())
    if coverage < MIN_COVERAGE or coverage > MAX_COVERAGE:
        return None
    return binary


def fill_holes(binary: np.ndarray) -> np.ndarray:
    """Isi lubang di dalam objek: bagian latar yang tidak terhubung ke tepi gambar."""
    background = (binary == 0).astype(np.uint8)
    count, labels = cv2.connectedComponents(background, connectivity=4)
    border = np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]))
    holes = (background > 0) & ~np.isin(labels, border)
    out = binary.copy()
    out[holes] = 255
    return out
