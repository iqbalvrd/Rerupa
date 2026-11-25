"""Garis sketsa dari foto lukisan.

Metode (dipilih lewat LINEART_METHOD, dibandingkan di eval/):
- model : Informative Drawings (controlnet_aux LineartDetector) — kontur bersih
- teed  : TEED — detektor tepi kecil, cadangan ringan
- xdog  : eXtended Difference of Gaussians — klasik, tanpa model
- canny : Canny setelah filter penjaga tepi — paling sederhana

Semua metode menghasilkan peta garis float 0–1 (1 = garis) berukuran sama dengan gambar,
lalu dibersihkan: ambang histeresis → buang komponen pendek (tekstur kanvas/serat) → PNG transparan.

Dua tingkat garis:
- kontur (outline_lines): peta tepi dari gambar resolusi rendah (OUTLINE_RES) → hanya garis luar
  objek dan bentuk besar. Dipakai tahap sketsa (lapisan `sketch`).
- detail (clean_lines): peta tepi resolusi penuh → lipatan, motif, rincian. Dipakai tahap detail.
"""

import cv2
import numpy as np
from PIL import Image

from cv.models import lineart_detector, teed_detector, teed_onnx

METHODS = ("model", "teed", "xdog", "canny")
LINE_RGB = (30, 30, 30)


def edge_map(img: np.ndarray, method: str, resolution: int | None = None) -> np.ndarray:
    """Peta tepi float 0–1 seukuran `img`. `resolution` = sisi pendek tempat model bekerja
    (None = penuh, maks 1024); nilai kecil (OUTLINE_RES) menghilangkan tekstur dan rincian."""
    if method not in METHODS:
        raise ValueError(f"metode garis tidak dikenal: {method}")
    h, w = img.shape[:2]
    res = min(1024, max(h, w)) if resolution is None else resolution
    if method == "teed" and teed_onnx() is not None:
        return _model_edge_map(img, method, h, w, res)  # onnxruntime, tanpa torch (worker RAM 1 GB)
    if method in ("model", "teed"):
        import torch

        # Tanpa gradien: hemat ±500 MB aktivasi di CPU.
        with torch.inference_mode():
            return _model_edge_map(img, method, h, w, res)
    if resolution is not None:
        # Metode klasik: kerjakan di gambar kecil lalu besarkan lagi, efeknya sama (rincian hilang).
        small = _resize_short_side(img, resolution)
        e = xdog(small) if method == "xdog" else canny(small)
        return cv2.resize(e, (w, h), interpolation=cv2.INTER_LINEAR)
    if method == "xdog":
        return xdog(img)
    return canny(img)


def _model_edge_map(img: np.ndarray, method: str, h: int, w: int, res: int) -> np.ndarray:
    if method == "model":
        out = lineart_detector()(Image.fromarray(img), coarse=False, detect_resolution=res, image_resolution=res)
    else:
        out = Image.fromarray(_teed_tiled(img, res))
    return _to_float_map(out, (w, h))


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


TARGET_DENSITY_PCT = 4.0  # % piksel garis "kuat" (benih); dikalibrasi dari evaluasi foto nyata
WEAK_DENSITY_PCT = 12.0  # % piksel yang boleh ikut sebagai garis bila tersambung ke garis kuat
MIN_THRESHOLD = 0.08
# Kontur: model bekerja di sisi pendek kecil → garis luar tokoh/objek tanpa motif kain dan lipatan.
# Uji 3 materi koleksi (23 Nov): Informative Drawings paling bersih di 320 px (384–512 mulai memuat
# motif); TEED di 320 px bergelombang seperti sel, baru membentuk siluet tokoh di 448 px.
OUTLINE_RES = {"model": 320, "teed": 448, "xdog": 320, "canny": 320}
OUTLINE_MIN_LENGTH = 0.04  # pecahan sisi terpanjang; kontur lebih pendek dari ini dibuang


def adaptive_threshold(edges: np.ndarray, target_density_pct: float = TARGET_DENSITY_PCT) -> float:
    """Ambang yang membuat ±target_density_pct piksel menjadi garis.

    Ambang tetap tidak bisa dipakai lintas metode/foto: di uji foto nyata XDoG hampir kosong
    dan TEED menutupi >50% gambar dengan ambang yang sama. Batas bawah mencegah noise
    dianggap garis pada gambar yang hampir polos.
    """
    return max(MIN_THRESHOLD, float(np.percentile(edges, 100 - target_density_pct)))


def hysteresis(edges: np.ndarray, strong: float, weak: float) -> np.ndarray:
    """Biner 0/1: piksel ≥ weak yang tersambung (8-tetangga) ke piksel ≥ strong.

    Ambang tunggal hanya menyisakan inti garis tergelap → kontur putus-putus jadi coretan pendek
    (terlihat jelas di materi koleksi, model Informative Drawings menghasilkan garis abu-abu lembut).
    Histeresis menyambung garis lemah ke garis kuat seperti Canny, tanpa menambah bintik tekstur.
    """
    weak_bin = (edges >= weak).astype(np.uint8)
    count, labels = cv2.connectedComponents(weak_bin, connectivity=8)
    keep = np.zeros(count, dtype=bool)
    keep[np.unique(labels[edges >= strong])] = True
    keep[0] = False
    return keep[labels].astype(np.uint8)


def _drop_short(binary: np.ndarray, min_length_px: int) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = np.zeros(count, dtype=bool)
    keep[1:] = np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) >= min_length_px
    return keep[labels].astype(np.uint8)


def clean_lines(edges: np.ndarray, threshold: float | None = None, min_length_px: int | None = None, thin: bool = True) -> np.ndarray:
    """Garis detail: ambang histeresis (adaptif bila threshold None), buang komponen pendek
    (bintik tekstur), lalu tipiskan. Return biner uint8 0/255."""
    h, w = edges.shape
    if min_length_px is None:
        min_length_px = max(12, round(max(h, w) * 0.012))  # ±20 px pada 1600 px
    if threshold is None:
        strong = adaptive_threshold(edges)
        weak = max(MIN_THRESHOLD * 0.6, min(strong, float(np.percentile(edges, 100 - WEAK_DENSITY_PCT))))
        binary = hysteresis(edges, strong, weak)
    else:
        binary = (edges >= threshold).astype(np.uint8)
    binary = _drop_short(binary, min_length_px)
    if thin:
        binary = thin_lines(binary)
    return binary * 255


def outline_lines(edges: np.ndarray) -> np.ndarray:
    """Garis kontur dari peta tepi resolusi rendah (edge_map(..., resolution=OUTLINE_RES[method])):
    histeresis, buang garis pendek, tutup celah kecil, tipiskan. Return biner uint8 0/255."""
    h, w = edges.shape
    strong = adaptive_threshold(edges)
    weak = max(MIN_THRESHOLD * 0.6, min(strong, float(np.percentile(edges, 100 - WEAK_DENSITY_PCT))))
    binary = _drop_short(hysteresis(edges, strong, weak), max(12, round(max(h, w) * OUTLINE_MIN_LENGTH)))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return thin_lines(binary) * 255


# Bentuk kasar (tingkat 1): peta tepi dari gambar SANGAT kecil, lalu hanya garis panjang.
# Prototipe 23 Nov: model 160 px terbaca sebagai bentuk tokoh (Bali, Diponegoro). TEED perlu lebih besar.
COARSE_RES = {"model": 160, "teed": 224, "xdog": 160, "canny": 160}
COARSE_MIN_LENGTH = 0.12  # pecahan sisi terpanjang (batas awal; dinaikkan bila garis terlalu banyak)
COARSE_DENSE_LENGTH = 7.0  # panjang total > sekian × (lebar + tinggi) = kisi rapat. Kalibrasi 25 Nov: karya yang terbaca 4,1–5,4; kisi TEED (sawah, adegan ramai) 8,6–10,9
COARSE_MAX_LENGTH = 1.5  # jatah panjang untuk kisi rapat: segmen terpanjang diambil sampai jatah ini
COARSE_MIN_LENGTH_TOTAL = 0.6  # bila panjang total garis < sekian × (lebar + tinggi), tambahkan siluet objek utama
SILHOUETTE_EPS = 0.015  # penyederhanaan siluet objek utama: pecahan keliling


def _skeleton_length(binary: np.ndarray) -> int:
    from skimage.morphology import skeletonize

    return int(skeletonize(binary > 0).sum())


def longest_segments(binary: np.ndarray, budget_px: float, min_len_px: int, max_segments: int = 40) -> np.ndarray:
    """Pecah jaringan garis di titik percabangan, lalu ambil segmen terpanjang sampai panjang total
    mencapai `budget_px`. Kisi rapat (petak sawah, motif) tersambung jadi satu jaringan besar yang
    selalu lolos filter "garis panjang"; dengan memecahnya, yang tersisa hanya beberapa kurva panjang.
    Return biner 0/1 (sudah dipertebal seragam)."""
    from skimage.morphology import skeletonize

    h, w = binary.shape
    sk = skeletonize(binary > 0).astype(np.uint8)
    neigh = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32)) - sk
    junctions = cv2.dilate(((sk == 1) & (neigh >= 3)).astype(np.uint8), np.ones((3, 3), np.uint8))
    segs = sk & (1 - junctions)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(segs, connectivity=8)
    lengths = stats[1:, cv2.CC_STAT_AREA]
    keep = np.zeros(count, dtype=bool)
    total = 0
    for i in np.argsort(-lengths)[:max_segments]:
        if lengths[i] < min_len_px or total >= budget_px:
            break
        keep[i + 1] = True
        total += int(lengths[i])
    out = keep[labels].astype(np.uint8)
    # Sambung lagi celah percabangan kecil di antara segmen terpilih, lalu pertebal.
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return thin_lines(out)


def coarse_lines(edges: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Garis bentuk kasar untuk langkah pertama sketsa: sedikit garis panjang.
    `edges` = edge_map(..., resolution=COARSE_RES[method]). Return biner uint8 0/255.

    Jumlah garis dibatasi lewat PANJANG TOTAL, bukan jumlah komponen: jaringan yang tersambung
    dihitung sesuai panjangnya. Siluet objek utama hanya dipakai bila garis panjangnya terlalu sedikit:
    di uji 25 Nov, siluet u2net yang disederhanakan jadi poligon bergerigi yang membingungkan."""
    h, w = edges.shape
    strong = adaptive_threshold(edges)
    weak = max(MIN_THRESHOLD * 0.6, min(strong, float(np.percentile(edges, 100 - WEAK_DENSITY_PCT))))
    base = hysteresis(edges, strong, weak)
    base = cv2.morphologyEx(base, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    # Utamakan garis panjang UTUH (bentuk tokoh terbaca: Bali, Diponegoro, Batik). Hanya bila hasilnya
    # kisi rapat (petak sawah: panjang total jauh di atas jatah), pecah jaringan dan ambil segmen terpanjang.
    binary = thin_lines(_drop_short(base, round(max(h, w) * COARSE_MIN_LENGTH)))
    if _skeleton_length(binary) > COARSE_DENSE_LENGTH * (w + h):
        binary = longest_segments(base, COARSE_MAX_LENGTH * (w + h), round(max(h, w) * COARSE_MIN_LENGTH * 0.5))
    few = _skeleton_length(binary) < COARSE_MIN_LENGTH_TOTAL * (w + h)
    if few and mask is not None and mask.any():
        silhouette = np.zeros((h, w), np.uint8)
        contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            if cv2.contourArea(c) < 0.02 * h * w:
                continue
            approx = cv2.approxPolyDP(c, SILHOUETTE_EPS * cv2.arcLength(c, True), True)
            cv2.polylines(silhouette, [approx], True, 1, stroke_width(h, w), cv2.LINE_AA)
        binary = np.maximum(binary, silhouette)
    return (binary > 0).astype(np.uint8) * 255


def split_by_object(lines: np.ndarray, mask: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    """(garis objek utama, garis latar): komponen yang menyentuh objek utama (mask dilebarkan sedikit)
    masuk objek; sisanya latar. Tanpa objek utama: semua jadi latar."""
    if mask is None or not mask.any():
        return np.zeros_like(lines), lines
    h, w = lines.shape
    k = max(3, round(max(h, w) * 0.01)) | 1
    near = cv2.dilate((mask > 0).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    count, labels = cv2.connectedComponents((lines > 0).astype(np.uint8), connectivity=8)
    touches = np.zeros(count, dtype=bool)
    touches[np.unique(labels[near > 0])] = True
    touches[0] = False
    obj = touches[labels]
    return np.where(obj, lines, 0).astype(np.uint8), np.where(obj, 0, lines).astype(np.uint8)


def subtract_lines(lines: np.ndarray, *earlier: np.ndarray, radius: int = 4) -> np.ndarray:
    """Garis `lines` tanpa yang sudah ada di tingkat sebelumnya (dalam jarak `radius` px), supaya
    tiap langkah hanya menampilkan garis baru."""
    if not earlier:
        return lines
    old = np.zeros_like(lines)
    for e in earlier:
        old = np.maximum(old, e)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    out = lines.copy()
    out[cv2.dilate(old, k) > 0] = 0
    return out


# Garis sungguhan: minimal sekian lebih gelap (L*, 0–100) dari KEDUA sisinya, diukur RIDGE_PROBE_PX ke kiri/kanan.
# Kalibrasi 25 Nov: Bali (gaya garis) ±50% kandidat lolos; Diponegoro (cat minyak) hampir tidak ada,
# karena wajah dan tangan sudah ada di kontur dan lipatannya tonal (diajarkan lewat warna).
RIDGE_DELTA_L = 4.0
RIDGE_PROBE_PX = 5


def select_detail_lines(lines: np.ndarray, img: np.ndarray, flat: bool, min_length_px: int | None = None) -> np.ndarray:
    """Pilah garis detail: simpan GARIS SUNGGUHAN (lebih gelap dari kedua sisinya: mata, alis, motif),
    buang TEPI NADA (gelap di satu sisi, terang di sisi lain: lipatan, bayangan) karena itu diajarkan
    lewat warna/terang-gelap. Karya datar (`flat`, gaya garis Kamasan): ambang dilonggarkan.

    Per piksel garis: bandingkan L* di titik itu dengan rata-rata L* di kedua sisi, tegak lurus arah
    garis (arah dari gradien peta garis). Keputusan diambil per segmen (mayoritas piksel)."""
    h, w = lines.shape
    binary = (lines > 0).astype(np.uint8)
    if not binary.any():
        return lines
    lab_l = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) * (100.0 / 255.0)
    lab_l = cv2.GaussianBlur(lab_l, (3, 3), 0)
    # Normal garis ≈ arah gradien dari peta garis yang dihaluskan.
    soft = cv2.GaussianBlur(binary.astype(np.float32), (0, 0), 2.0)
    gx, gy = cv2.Sobel(soft, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(soft, cv2.CV_32F, 0, 1, ksize=3)
    ys, xs = np.nonzero(binary)
    nx, ny = gx[ys, xs], gy[ys, xs]
    norm = np.hypot(nx, ny) + 1e-6
    nx, ny = nx / norm, ny / norm
    d = RIDGE_PROBE_PX

    def sample(px, py):
        return lab_l[np.clip(np.round(py).astype(int), 0, h - 1), np.clip(np.round(px).astype(int), 0, w - 1)]

    center = sample(xs, ys)
    side_a = sample(xs + nx * d, ys + ny * d)
    side_b = sample(xs - nx * d, ys - ny * d)
    delta = RIDGE_DELTA_L * (0.5 if flat else 1.0)
    ridge = (np.minimum(side_a, side_b) - center) >= delta

    count, labels = cv2.connectedComponents(binary, connectivity=8)
    seg = labels[ys, xs]
    votes = np.bincount(seg, weights=ridge.astype(np.float64), minlength=count)
    totals = np.bincount(seg, minlength=count).astype(np.float64)
    keep = votes >= 0.5 * np.maximum(totals, 1)
    keep[0] = False
    out = keep[labels].astype(np.uint8)
    if min_length_px is None:
        min_length_px = max(8, round(max(h, w) * 0.01))
    return _drop_short(out, min_length_px) * 255


def lines_svg_body(binary: np.ndarray, stroke: str = "#1E1E1E", width: int | None = None, epsilon: float = 1.2) -> str:
    """Garis biner → <path> SVG (M/L/Z saja, dibaca ulang cv/svgpath.py untuk checkpoint).
    Tiap garis dilacak sebagai kontur tertutup di sekeliling kerangka 1 px, jadi bila digoreskan
    hasilnya tetap satu garis."""
    from skimage.morphology import skeletonize

    skeleton = skeletonize(binary > 0).astype(np.uint8)
    contours, _ = cv2.findContours(skeleton, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        c = cv2.approxPolyDP(c, epsilon, True)
        pts = c.reshape(-1, 2)
        if len(pts) < 2:
            continue
        if len(pts) == 2:  # garis lurus: tulis bolak-balik (svgpath butuh ≥3 titik)
            pts = np.vstack([pts, pts[:1]])
        parts.append("M" + " L".join(f"{x} {y}" for x, y in pts) + " Z")
    if not parts:
        return ""
    width = width or stroke_width(*binary.shape)
    return (f'<path fill="none" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round" '
            f'd="{" ".join(parts)}"/>')


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
