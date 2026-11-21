"""Foto progres sintetis untuk tes checkpoint: target sederhana + sketsa pensil di kertas yang difoto miring."""

import cv2
import numpy as np

from cv.render import svg_doc

W, H = 1200, 900  # ruang koordinat tutorial
GRID = (4, 3)


def _ellipse_poly(cx, cy, rx, ry, n=64):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([cx + rx * np.cos(t), cy + ry * np.sin(t)], axis=1)


def _rect_poly(x, y, w, h):
    return np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype=float)


def _d(*polys):
    return " ".join("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + " Z" for p in polys)


SHAPES = {
    # kode: (poligon, hex, is_main)
    "r02": (_ellipse_poly(520, 470, 210, 300), "#8A3B2A", True),  # figur utama
    "r03": (_rect_poly(840, 520, 250, 260), "#3C5A8A", False),  # kotak kanan bawah
}


def target() -> dict:
    """SVG lapisan + metadata region seperti yang disimpan tutorial."""
    bg = _rect_poly(0, 0, W, H)
    regions = [f'<path id="r01" fill="#E8DCC0" d="{_d(bg, *[p for p, _, _ in SHAPES.values()])}"/>']
    regions += [f'<path id="{c}" fill="{hx}" d="{_d(p)}"/>' for c, (p, hx, _) in SHAPES.items()]
    sketch = [f'<path fill="none" stroke="#1E1E1E" d="{_d(p)}"/>' for p, _, _ in SHAPES.values()]
    main = [f'<path fill="none" stroke="#1E1E1E" d="{_d(SHAPES["r02"][0])}"/>']
    area = {c: float(cv2.contourArea(p.astype(np.float32)) / (W * H) * 100) for c, (p, _, _) in SHAPES.items()}
    meta = [{"code": "r01", "hex": "#E8DCC0", "area_pct": 100 - sum(area.values()), "is_background": True, "is_main_object": False}]
    meta += [{"code": c, "hex": hx, "area_pct": area[c], "is_background": False, "is_main_object": m} for c, (_, hx, m) in SHAPES.items()]
    return {
        "regions_svg": svg_doc(W, H, "".join(regions), "regions"),
        "sketch_svg": svg_doc(W, H, "".join(sketch), "sketch"),
        "main_object_svg": svg_doc(W, H, "".join(main), "main_object"),
        "regions": meta,
        "width": W,
        "height": H,
        "grid": GRID,
    }


def drawing(
    shift=(0.0, 0.0),
    scale_x: dict | None = None,
    draw_grid=True,
    draw_shapes=True,
    pencil=95,
    paint=False,
) -> np.ndarray:
    """Kertas W×H (RGB) berisi grid tipis + garis luar bentuk. shift dalam piksel tutorial per kode
    lewat dict {kode: (dx, dy)} atau tuple untuk semua; scale_x = {kode: faktor lebar}."""
    paper = np.full((H, W, 3), 246, np.uint8)
    paper[..., 2] = 238
    if draw_grid:
        for i in range(1, GRID[0]):
            x = round(W * i / GRID[0])
            cv2.line(paper, (x, 0), (x, H - 1), (150, 150, 150), 2, cv2.LINE_AA)
        for j in range(1, GRID[1]):
            y = round(H * j / GRID[1])
            cv2.line(paper, (0, y), (W - 1, y), (150, 150, 150), 2, cv2.LINE_AA)
    for code, (poly, hx, _) in SHAPES.items():
        p = poly.copy()
        if scale_x and code in scale_x:
            cx = p[:, 0].mean()
            p[:, 0] = cx + (p[:, 0] - cx) * scale_x[code]
        s = shift.get(code, (0, 0)) if isinstance(shift, dict) else shift
        p += np.array(s, dtype=float)
        if paint:
            rgb = tuple(int(hx[i : i + 2], 16) for i in (1, 3, 5))
            cv2.fillPoly(paper, [np.round(p).astype(np.int32)], rgb, cv2.LINE_AA)
        if draw_shapes:
            cv2.polylines(paper, [np.round(p).astype(np.int32)], True, (pencil,) * 3, 3, cv2.LINE_AA)
    return paper


def photograph(paper: np.ndarray, blur: float = 0.8, seed: int = 0) -> tuple[np.ndarray, list[float]]:
    """Foto miring 1600×1200 dari kertas di atas meja + cahaya tidak rata + derau. Return (foto, sudut)."""
    rng = np.random.default_rng(seed)
    out_w, out_h = 1600, 1200
    src = np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], dtype=np.float32)
    dst = np.array([[260, 190], [1390, 240], [1330, 1050], [210, 990]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(src, dst)
    table = np.zeros((out_h, out_w, 3), np.uint8)
    table[:] = (92, 70, 52)
    warped = cv2.warpPerspective(paper, m, (out_w, out_h))
    mask = cv2.warpPerspective(np.full((H, W), 255, np.uint8), m, (out_w, out_h)) > 127
    photo = table.copy()
    photo[mask] = warped[mask]
    yy, xx = np.mgrid[0:out_h, 0:out_w]
    light = 0.82 + 0.18 * (xx / out_w)  # lebih gelap di kiri
    photo = np.clip(photo * light[..., None] + rng.normal(0, 3, photo.shape), 0, 255).astype(np.uint8)
    if blur > 0:
        photo = cv2.GaussianBlur(photo, (0, 0), blur)
    return photo, dst.reshape(-1).tolist()


def drawing_from_svg(sketch_svg: str, width: int, height: int, grid: tuple[int, int], shift=(0, 0), draw_lines=True) -> np.ndarray:
    """Kertas berisi grid + garis dari sketch.svg tutorial nyata (untuk tes integrasi)."""
    from cv import svgpath

    paper = np.full((height, width, 3), 246, np.uint8)
    for i in range(1, grid[0]):
        x = round(width * i / grid[0])
        cv2.line(paper, (x, 0), (x, height - 1), (150, 150, 150), 2, cv2.LINE_AA)
    for j in range(1, grid[1]):
        y = round(height * j / grid[1])
        cv2.line(paper, (0, y), (width - 1, y), (150, 150, 150), 2, cv2.LINE_AA)
    if draw_lines:
        for p in svgpath.paths(sketch_svg):
            polys = [np.round(q + np.array(shift, dtype=float)).astype(np.int32) for q in p["polys"]]
            cv2.polylines(paper, polys, True, (90, 90, 90), 3, cv2.LINE_AA)
    return paper


def photograph_any(paper: np.ndarray, blur: float = 0.8, seed: int = 0) -> tuple[np.ndarray, list[float]]:
    """Seperti photograph(), untuk kertas ukuran apa pun."""
    rng = np.random.default_rng(seed)
    h, w = paper.shape[:2]
    out_w, out_h = 1600, 1200
    k = min(1100 / w, 820 / h)
    pw, ph = w * k, h * k
    x0, y0 = (out_w - pw) / 2, (out_h - ph) / 2
    dst = np.array([[x0 + 30, y0], [x0 + pw, y0 + 25], [x0 + pw - 35, y0 + ph], [x0, y0 + ph - 20]], dtype=np.float32)
    src = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(src, dst)
    photo = np.zeros((out_h, out_w, 3), np.uint8)
    photo[:] = (92, 70, 52)
    warped = cv2.warpPerspective(paper, m, (out_w, out_h))
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), m, (out_w, out_h)) > 127
    photo[mask] = warped[mask]
    photo = np.clip(photo + rng.normal(0, 3, photo.shape), 0, 255).astype(np.uint8)
    if blur > 0:
        photo = cv2.GaussianBlur(photo, (0, 0), blur)
    return photo, dst.reshape(-1).tolist()


def painting_from_svg(regions_svg: str, regions: list[dict], open_codes: set[str], width: int, height: int, skip: set[str] = frozenset()) -> np.ndarray:
    """Kertas dengan region yang sudah dibuka dicat sesuai warnanya (kecuali `skip`), untuk checkpoint tahap warna."""
    from cv import svgpath

    codes = [r["code"] for r in regions]
    labels = svgpath.region_labels(regions_svg, codes, (width, height), 1.0)
    paper = np.full((height, width, 3), 246, np.uint8)
    for i, r in enumerate(regions):
        if r["code"] in open_codes and r["code"] not in skip:
            paper[labels == i] = [int(r["hex"][k : k + 2], 16) for k in (1, 3, 5)]
    return paper


def fetch_text(url: str, attempts: int = 3) -> str:
    """Unduh lapisan SVG dari signed URL; tahan timeout koneksi sesaat (jaringan laptop ke Supabase)."""
    import time

    import httpx

    for i in range(attempts):
        try:
            r = httpx.get(url, timeout=30)
            r.raise_for_status()
            return r.text
        except httpx.HTTPError:
            if i == attempts - 1:
                raise
            time.sleep(1 + i)
    raise RuntimeError("unreachable")
