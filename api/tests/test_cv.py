"""Tes pipeline CV dengan gambar sintetis (tanpa jaringan).

Tes yang memakai model pretrained (rembg, lineart, TEED) hanya jalan bila RUN_MODEL_TESTS=1,
karena butuh unduhan bobot sekali (±200 MB).
"""

import io
import os
import re
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

from cv import lineart, normalize, pipeline, quality
from cv.mask import clean_mask, fill_holes
from cv.regions import min_area_fraction, segment

models = pytest.mark.skipif(os.environ.get("RUN_MODEL_TESTS") != "1", reason="set RUN_MODEL_TESTS=1 untuk tes model")


def figure_image(noise: float = 6.0, speckles: int = 400, size=(1200, 900)) -> np.ndarray:
    """Latar krem, badan merah, kepala hijau, kain biru + bintik tekstur dan noise."""
    rng = np.random.default_rng(1)
    h, w = size
    img = np.full((h, w, 3), (241, 230, 207), np.uint8)
    cv2.rectangle(img, (300, 400), (600, 1000), (181, 83, 46), -1)
    cv2.circle(img, (450, 300), 110, (70, 140, 90), -1)
    cv2.rectangle(img, (330, 650), (570, 760), (50, 70, 160), -1)
    for _ in range(speckles):
        cv2.circle(img, (int(rng.integers(0, w)), int(rng.integers(0, h))), 2, (200, 190, 170), -1)
    return np.clip(img + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)


def to_jpeg(img: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, "JPEG", quality=92)
    return buf.getvalue()


# ---------- normalisasi ----------

def test_normalize_resizes_long_side():
    big = np.zeros((3000, 2000, 3), np.uint8) + 128
    out = normalize.normalize(to_jpeg(big))
    assert max(out.shape[:2]) == 1600 and out.shape[0] == 1600


def test_crop_scope_fraction():
    img = np.zeros((1000, 800, 3), np.uint8)
    out = normalize.crop_scope(img, {"x": 0.25, "y": 0.1, "w": 0.5, "h": 0.5})
    assert out.shape[:2] == (500, 400)


def test_crop_scope_too_small():
    with pytest.raises(ValueError):
        normalize.crop_scope(np.zeros((100, 100, 3), np.uint8), {"x": 0, "y": 0, "w": 0.1, "h": 0.1})


# ---------- kualitas ----------

def test_quality_sharp_image_usable():
    assert quality.assess(figure_image()).usable


def test_quality_detects_blur_and_dark():
    blurry = cv2.GaussianBlur(figure_image(noise=0, speckles=0), (0, 0), 12)
    assert "blurry" in quality.assess(blurry).reasons
    dark = (figure_image() * 0.12).astype(np.uint8)
    assert "too_dark" in quality.assess(dark).reasons


# ---------- region ----------

def test_segment_finds_shapes_and_merges_texture():
    seg = segment(figure_image(), None)
    assert len(seg.regions) == 4  # latar, badan, kepala, kain — bintik & noise tergabung
    hexes = {r.code: r.hex for r in seg.regions}
    assert hexes["r01"].startswith("#F")  # latar krem terbesar
    assert seg.regions[0].is_background


def test_regions_cover_everything_without_gaps():
    seg = segment(figure_image(), None)
    assert set(np.unique(seg.labels)) == set(range(len(seg.regions)))
    assert abs(sum(r.area_pct for r in seg.regions) - 100) < 0.1


def test_region_neighbors_are_symmetric():
    seg = segment(figure_image(), None)
    by_code = {r.code: r for r in seg.regions}
    for r in seg.regions:
        for n in r.neighbors:
            assert r.code in by_code[n].neighbors


def test_region_paths_use_full_size_coordinates():
    seg = segment(figure_image(), None)
    numbers = [float(v) for r in seg.regions for v in re.findall(r"[-\d.]+", r.path_svg)]
    assert max(numbers) > 800  # skala kerja 800 → penuh 1200
    assert all(r.path_svg.startswith("M") for r in seg.regions)


def test_mask_marks_main_object():
    img = figure_image()
    mask = np.zeros(img.shape[:2], np.uint8)
    cv2.rectangle(mask, (300, 400), (600, 1000), 255, -1)
    seg = segment(img, mask)
    main = [r for r in seg.regions if r.is_main_object]
    assert main and all(r.hex.startswith(("#B", "#3")) for r in main)  # badan merah & kain biru


def test_max_regions_cap():
    rng = np.random.default_rng(3)
    noisy = rng.integers(0, 255, (600, 600, 3), dtype=np.uint8)
    noisy = cv2.resize(cv2.resize(noisy, (30, 30)), (600, 600), interpolation=cv2.INTER_NEAREST)
    seg = segment(noisy, None, max_regions=35)
    assert len(seg.regions) <= 35


def test_min_area_depends_on_canvas():
    assert min_area_fraction("A3") < min_area_fraction("A4")


# ---------- mask ----------

def test_fill_holes_and_clean_mask():
    m = np.zeros((200, 200), np.uint8)
    cv2.circle(m, (100, 100), 60, 255, -1)
    cv2.circle(m, (100, 100), 15, 0, -1)  # lubang
    assert fill_holes(m)[100, 100] == 255
    tiny = np.zeros((200, 200), np.uint8)
    tiny[0:3, 0:3] = 255
    assert clean_mask(tiny) is None  # cakupan terlalu kecil → tidak andal


# ---------- garis ----------

@pytest.mark.parametrize("method", ["xdog", "canny"])
def test_classic_lineart_finds_outline(method):
    img = figure_image()
    binary = lineart.clean_lines(lineart.edge_map(img, method))
    assert binary.shape == img.shape[:2]
    # Ada garis di sekitar tepi kiri badan (x=300), hampir tidak ada di tengah latar kosong.
    assert binary[500:900, 295:306].mean() > 0
    assert binary[50:150, 50:150].mean() < 10


def test_clean_lines_removes_short_specks():
    edges = np.zeros((400, 400), np.float32)
    edges[100, 50:350] = 1.0  # garis panjang
    edges[300:303, 300:303] = 1.0  # bintik
    out = lineart.clean_lines(edges)
    assert out[100, 200] == 255 and out[301, 301] == 0


def test_hysteresis_keeps_faint_part_of_a_line_but_not_faint_specks():
    """Garis lembut model koleksi: inti gelap + ekor abu-abu. Ambang tunggal memotong ekornya
    (kontur jadi coretan pendek); histeresis menyambungnya. Abu-abu yang tidak tersambung tetap dibuang."""
    edges = np.zeros((200, 400), np.float32)
    edges[50, 20:120] = 0.9  # inti kuat
    edges[50, 120:380] = 0.3  # lanjutan lemah, tersambung
    edges[150, 20:380] = 0.3  # garis lemah tanpa inti kuat
    out = lineart.hysteresis(edges, strong=0.8, weak=0.2)
    assert out[50, 300] == 1 and out[150, 300] == 0


def test_outline_keeps_long_contours_and_drops_short_texture():
    edges = np.zeros((600, 600), np.float32)
    cv2.circle(edges, (300, 300), 200, 0.9, 2)  # kontur objek
    for x in range(60, 540, 30):  # motif kecil-kecil
        edges[290:296, x] = 0.9
    out = lineart.outline_lines(edges)
    assert out[100, 300] == 255 or out[101, 300] == 255 or out[99, 300] == 255
    assert out[290:296, 300].max() == 0


def test_outline_svg_reads_back_for_checkpoint():
    """Lapisan sketsa dibaca ulang svgpath.stroke_map oleh checkpoint: garisnya harus di tempat yang sama."""
    from cv import svgpath

    binary = np.zeros((300, 300), np.uint8)
    cv2.line(binary, (30, 150), (270, 150), 255, 3)
    body = lineart.lines_svg_body(binary)
    svg = f'<svg viewBox="0 0 300 300">{body}</svg>'
    back = svgpath.stroke_map(svg, (300, 300), 1.0, thickness=2)
    assert back[148:153, 150].max() == 1 and back[100, 150] == 0


# ---------- pipeline ----------

def test_pipeline_without_models():
    res = pipeline.run(to_jpeg(figure_image()), mask_model=None, lineart_method="xdog")
    assert (res.width, res.height) == (900, 1200)
    assert len(res.regions) == 4 and res.use_shading is False
    assert res.regions_svg.startswith("<svg") and 'viewBox="0 0 900 1200"' in res.regions_svg
    assert res.value_svg is None
    assert Image.open(io.BytesIO(res.lineart_png)).mode == "RGBA"
    assert Image.open(io.BytesIO(res.numbered_png)).size[0] > 0
    assert "path_svg" not in str(res.summary()["regions"])


def test_pipeline_forced_shading_builds_value_layer():
    res = pipeline.run(to_jpeg(figure_image()), mask_model=None, use_shading=True, value_levels=3)
    assert res.use_shading and res.value_svg and 'data-level="1"' in res.value_svg
    assert all(r.value_level in (1, 2, 3) for r in res.regions)


def test_volumetric_painting_suggests_shading():
    # Gradien sintetis murni terpecah jadi pita polos oleh k-means (12 warna), jadi dipakai lukisan nyata.
    photo = Path(__file__).resolve().parents[2] / "content/artworks/raden-saleh-penangkapan-diponegoro/image.jpg"
    if not photo.exists():
        pytest.skip("materi koleksi tidak tersedia")
    res = pipeline.run(photo.read_bytes(), mask_model=None)
    flat = pipeline.run(to_jpeg(figure_image()), mask_model=None)
    assert res.shading_hint > flat.shading_hint


# ---------- model pretrained (opsional) ----------

@models
@pytest.mark.parametrize("method", ["model", "teed"])
def test_model_lineart_runs(method):
    edges = lineart.edge_map(figure_image(), method)
    assert edges.shape == (1200, 900) and 0 < edges.mean() < 0.5


@models
@pytest.mark.parametrize("model", ["isnet-general-use", "u2net"])
def test_rembg_mask_runs(model):
    from cv.mask import main_object_mask

    mask = main_object_mask(figure_image(), model)
    assert mask is None or mask.shape == (1200, 900)
