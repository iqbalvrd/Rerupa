"""Merakit lapisan SVG dan gambar region bernomor untuk AI."""

import cv2
import numpy as np

from cv.regions import Segmentation, _region_path


def svg_doc(width: int, height: int, body: str, layer: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" data-layer="{layer}">{body}</svg>'
    )


def regions_svg(seg: Segmentation, width: int, height: int) -> str:
    # stroke sewarna fill menutup celah tipis antar-poligon hasil penyederhanaan kontur.
    body = "".join(
        f'<path id="{r.code}" data-code="{r.code}" fill="{r.hex}" stroke="{r.hex}" stroke-width="1" '
        f'stroke-linejoin="round" fill-rule="evenodd" d="{r.path_svg}"/>'
        for r in seg.regions
        if r.path_svg
    )
    return svg_doc(width, height, body, "regions")


def main_object_svg(mask: np.ndarray | None, width: int, height: int) -> str | None:
    if mask is None:
        return None
    small_scale = max(mask.shape) / 800
    small = cv2.resize(mask, (round(mask.shape[1] / small_scale), round(mask.shape[0] / small_scale)), interpolation=cv2.INTER_NEAREST) if small_scale > 1 else mask
    path = _region_path(small > 0, width / small.shape[1])
    body = f'<path fill="none" stroke="#1E1E1E" stroke-width="3" fill-rule="evenodd" d="{path}"/>'
    return svg_doc(width, height, body, "main_object")


def sketch_svg(seg: Segmentation, mask: np.ndarray | None, width: int, height: int, min_area_pct: float = 2.0) -> str:
    """Garis bentuk besar untuk tahap sketsa: kontur objek utama + batas region besar."""
    parts = []
    for r in seg.regions:
        if r.area_pct >= min_area_pct and r.path_svg:
            parts.append(f'<path fill="none" stroke="#1E1E1E" stroke-width="2" d="{r.path_svg}"/>')
    obj = main_object_svg(mask, width, height)
    if obj:
        parts.append(obj[obj.index(">") + 1 : obj.rindex("</svg>")])
    return svg_doc(width, height, "".join(parts), "sketch")


def numbered_image(seg: Segmentation, max_side: int = 1024) -> np.ndarray:
    """Region diwarnai + batas hitam + nomor di titik paling 'dalam' tiap region (RGB uint8).

    Dikirim ke AI bersama foto agar AI bisa mengaitkan 'jubah merah' dengan r07.
    """
    labels = seg.labels
    h, w = labels.shape
    scale = max_side / max(h, w)
    if scale > 1:
        labels = cv2.resize(labels.astype(np.uint16), (round(w * scale), round(h * scale)), interpolation=cv2.INTER_NEAREST).astype(np.int32)
        h, w = labels.shape
    else:
        scale = 1.0

    colors = np.array([[int(r.hex[i : i + 2], 16) for i in (1, 3, 5)] for r in seg.regions], dtype=np.uint8)
    img = colors[labels]

    boundary = np.zeros((h, w), dtype=bool)
    boundary[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    boundary[1:, :] |= labels[1:, :] != labels[:-1, :]
    img[boundary] = (20, 20, 20)

    font_scale = max(0.5, max(h, w) / 1400)
    for i, r in enumerate(seg.regions):
        # Bingkai 0 di sekeliling: tepi gambar ikut dihitung batas, jadi nomor tidak jatuh di pojok.
        sel = np.pad((labels == i).astype(np.uint8), 1)
        dist = cv2.distanceTransform(sel, cv2.DIST_L2, 3)[1:-1, 1:-1]
        y, x = np.unravel_index(int(dist.argmax()), dist.shape)
        _badge(img, str(i + 1), int(x), int(y), font_scale)
    return img


def _badge(img: np.ndarray, text: str, cx: int, cy: int, font_scale: float) -> None:
    """Label kotak putih bergaris hitam dengan angka hitam — terbaca di atas warna apa pun."""
    (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2)
    pad = max(3, int(th * 0.35))
    h, w = img.shape[:2]
    x0 = int(np.clip(cx - tw / 2 - pad, 0, w - tw - 2 * pad - 1))
    y0 = int(np.clip(cy - th / 2 - pad, 0, h - th - 2 * pad - 1))
    x1, y1 = x0 + tw + 2 * pad, y0 + th + 2 * pad
    cv2.rectangle(img, (x0, y0), (x1, y1), (255, 255, 255), -1)
    cv2.rectangle(img, (x0, y0), (x1, y1), (0, 0, 0), 1)
    cv2.putText(img, text, (x0 + pad, y1 - pad), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 2, cv2.LINE_AA)
