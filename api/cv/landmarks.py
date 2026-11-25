"""Titik patokan (langkah 3 fase Sketsa): 3–5 titik kunci yang ditandai sebelum menggambar bentuk.

Riset (RISET_TUTORIAL.md §2B): kesalahan menggambar terutama dari salah melihat; titik patokan + nama
kotak grid membantu pemula menaruh bentuk di tempat yang benar sebelum menggambar garis.

Kandidat, urut prioritas:
1. Ujung bentuk kasar: titik teratas, terbawah, terkiri, terkanan.
2. Ujung dan sudut paling tajam siluet objek utama (hanya bila luasnya wajar, MASK_AREA_OK).
3. Cakrawala: ujung kiri garis latar mendatar yang panjang.
4. Cadangan: ujung-ujung garis bentuk kasar.
Titik di dekat tepi gambar dibuang (tidak membantu menaruh bentuk).
Dipilih yang saling berjauhan (≥ MIN_SPACING × sisi terpanjang), maksimal MAX_POINTS.
"""

from dataclasses import asdict, dataclass

import cv2
import numpy as np

from cv.grid import cell_name

MIN_POINTS, MAX_POINTS = 3, 5
MIN_SPACING = 0.2
BORDER = 0.04  # titik dalam jarak sekian × sisi dari tepi gambar tidak membantu → dibuang
MASK_AREA_OK = (0.05, 0.7)  # objek utama terlalu kecil (sepotong badan) / terlalu besar (seluruh adegan) → abaikan


@dataclass
class Landmark:
    no: int
    x: int
    y: int
    grid_cell: str
    kind: str  # top | bottom | left | right | corner | horizon | end
    label: str | None = None


def find_landmarks(coarse: np.ndarray, background: np.ndarray, mask: np.ndarray | None) -> list[Landmark]:
    """coarse/background: garis biner 0/255 (tingkat 1). mask: objek utama (atau None)."""
    h, w = coarse.shape
    cands: list[tuple[str, int, int]] = []

    # Ujung-ujung bentuk kasar (atas, bawah, kiri, kanan) — tetap berguna saat objek utama tidak andal.
    ys, xs = np.nonzero(coarse > 0)
    if len(xs):
        for kind, idx in (("top", ys.argmin()), ("bottom", ys.argmax()), ("left", xs.argmin()), ("right", xs.argmax())):
            cands.append((kind, int(xs[idx]), int(ys[idx])))

    mask_frac = float((mask > 0).mean()) if mask is not None else 0.0
    if mask is not None and MASK_AREA_OK[0] <= mask_frac <= MASK_AREA_OK[1]:
        contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        main = max(contours, key=cv2.contourArea)
        pts = main.reshape(-1, 2)
        for kind, idx in (("top", pts[:, 1].argmin()), ("bottom", pts[:, 1].argmax()),
                          ("left", pts[:, 0].argmin()), ("right", pts[:, 0].argmax())):
            cands.append((kind, int(pts[idx][0]), int(pts[idx][1])))
        approx = cv2.approxPolyDP(main, 0.015 * cv2.arcLength(main, True), True).reshape(-1, 2)
        if len(approx) >= 3:
            angles = [_angle(approx[i - 1], approx[i], approx[(i + 1) % len(approx)]) for i in range(len(approx))]
            i = int(np.argmin(angles))
            cands.append(("corner", int(approx[i][0]), int(approx[i][1])))

    horizon = _horizon(background)
    if horizon:
        cands.append(("horizon", *horizon))

    margin = BORDER * max(h, w)

    def inside(c):
        return margin <= c[1] <= w - margin and margin <= c[2] <= h - margin

    cands = [c for c in cands if inside(c)]
    if len(cands) < MAX_POINTS:  # cadangan: ujung-ujung garis bentuk kasar
        cands += [c for c in (("end", x, y) for x, y in _line_ends(coarse)) if inside(c)]

    chosen: list[tuple[str, int, int]] = []
    spacing = MIN_SPACING * max(h, w)
    for spacing_try in (spacing, spacing * 0.6, spacing * 0.3):
        for c in cands:
            if len(chosen) >= MAX_POINTS:
                break
            if all(np.hypot(c[1] - o[1], c[2] - o[2]) >= spacing_try for o in chosen):
                chosen.append(c)
        if len(chosen) >= MIN_POINTS:
            break
    # Nomor urut baca: atas ke bawah, kiri ke kanan (lebih mudah diikuti).
    chosen.sort(key=lambda c: (c[2] // max(1, h // 6), c[1]))
    return [Landmark(i + 1, x, y, cell_name(x, y, w, h), kind) for i, (kind, x, y) in enumerate(chosen)]


def to_dicts(points: list[Landmark]) -> list[dict]:
    return [asdict(p) for p in points]


def landmarks_svg_body(points: list[Landmark], width: int, height: int) -> str:
    r = max(8, round(max(width, height) / 90))
    parts = []
    for p in points:
        parts.append(
            f'<g data-no="{p.no}"><circle cx="{p.x}" cy="{p.y}" r="{r}" fill="#C0392B" stroke="#FFFFFF" stroke-width="{max(2, r // 4)}"/>'
            f'<text x="{p.x + r * 1.3:.0f}" y="{p.y - r * 0.6:.0f}" font-size="{r * 2}" font-family="sans-serif" font-weight="700" '
            f'fill="#C0392B" stroke="#FFFFFF" stroke-width="{max(2, r // 3)}" paint-order="stroke">{p.no}</text></g>'
        )
    return "".join(parts)


def _angle(a, b, c) -> float:
    v1, v2 = a - b, c - b
    cos = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6))
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def _horizon(background: np.ndarray) -> tuple[int, int] | None:
    """Ujung kiri garis latar yang hampir mendatar dan panjang (≥ 40% lebar)."""
    h, w = background.shape
    count, labels, stats, _ = cv2.connectedComponentsWithStats((background > 0).astype(np.uint8), connectivity=8)
    best = None
    for i in range(1, count):
        bw, bh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        if bw >= 0.4 * w and bh <= 0.15 * bw and (best is None or bw > best[0]):
            ys, xs = np.nonzero(labels == i)
            j = xs.argmin()
            best = (bw, int(xs[j]), int(ys[j]))
    return (best[1], best[2]) if best else None


def _line_ends(coarse: np.ndarray) -> list[tuple[int, int]]:
    """Titik ujung garis terpanjang (kerangka 1 px: piksel dengan tepat satu tetangga)."""
    from skimage.morphology import skeletonize

    sk = skeletonize(coarse > 0).astype(np.uint8)
    neigh = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32)) - sk
    ys, xs = np.nonzero((sk == 1) & (neigh == 1))
    return list(zip(xs.tolist(), ys.tolist()))
