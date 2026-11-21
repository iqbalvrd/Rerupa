"""Membaca lapisan SVG buatan cv/render.py kembali menjadi raster (untuk membandingkan foto progres).

Path dari render.py hanya memakai perintah M, L, Z dengan koordinat absolut, jadi parser kecil cukup.
"""

import re

import cv2
import numpy as np

_PATH_RE = re.compile(r"<path\b([^>]*)/?>")
_ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def parse_d(d: str) -> list[np.ndarray]:
    """'M x y L x y … Z M …' → daftar poligon (N×2 float)."""
    polys = []
    for sub in re.split(r"(?=M)", d.strip()):
        nums = [float(v) for v in _NUM_RE.findall(sub)]
        if len(nums) >= 6:
            polys.append(np.array(nums[: len(nums) // 2 * 2], dtype=np.float64).reshape(-1, 2))
    return polys


def paths(svg: str) -> list[dict]:
    """Semua <path>: atribut (id, fill, stroke, …) + poligon."""
    out = []
    for m in _PATH_RE.finditer(svg):
        attrs = dict(_ATTR_RE.findall(m.group(1)))
        if "d" in attrs:
            out.append({**attrs, "polys": parse_d(attrs["d"])})
    return out


def _scaled(polys: list[np.ndarray], scale: float) -> list[np.ndarray]:
    return [np.round(p * scale).astype(np.int32) for p in polys]


def region_labels(regions_svg: str, codes: list[str], size: tuple[int, int], scale: float) -> np.ndarray:
    """Peta label (H×W int16): indeks ke `codes`, -1 = bukan region manapun. size = (w, h) keluaran."""
    w, h = size
    labels = np.full((h, w), -1, dtype=np.int16)
    index = {c: i for i, c in enumerate(codes)}
    for p in paths(regions_svg):
        i = index.get(p.get("id", ""))
        if i is None or not p["polys"]:
            continue
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, _scaled(p["polys"], scale), 1)  # fillPoly memakai even-odd → lubang tetap lubang
        labels[mask > 0] = i
    return labels


def stroke_map(svg: str, size: tuple[int, int], scale: float, thickness: int = 2) -> np.ndarray:
    """Semua garis (path) dalam SVG sebagai peta biner uint8 0/1."""
    w, h = size
    out = np.zeros((h, w), dtype=np.uint8)
    for p in paths(svg):
        cv2.polylines(out, _scaled(p["polys"], scale), True, 1, thickness, cv2.LINE_AA)
    return (out > 0).astype(np.uint8)


def filled_mask(svg: str, size: tuple[int, int], scale: float) -> np.ndarray:
    """Isi semua path (mis. siluet objek utama dari main_object.svg)."""
    w, h = size
    out = np.zeros((h, w), dtype=np.uint8)
    polys = [q for p in paths(svg) for q in _scaled(p["polys"], scale)]
    if polys:
        cv2.fillPoly(out, polys, 1)
    return out
