"""Pipeline CV lengkap: foto → semua lapisan + region graph.

Tidak menyentuh database atau AI; dipanggil worker (Fase 3) dan skrip evaluasi (eval/run_cv.py).
"""

import logging
import time
from contextlib import contextmanager

import numpy as np

from cv import lineart as lineart_mod
from cv import normalize as norm
from cv import quality as quality_mod
from cv import render, value
from cv.mask import main_object_mask
from cv.regions import segment
from cv.types import CvResult

log = logging.getLogger("rerupa.cv")

# Dari evaluasi foto nyata: Raden Saleh 0,89; lukisan Bali gaya Kamasan 0,51–0,54; bidang datar <0,2.
SHADING_HINT_THRESHOLD = 0.7


@contextmanager
def _timer(timings: dict, key: str):
    start = time.perf_counter()
    yield
    timings[key] = int((time.perf_counter() - start) * 1000)


def run(
    image_bytes: bytes,
    *,
    scope: dict | None = None,
    canvas_size: str | None = "A4",
    lineart_method: str = "xdog",
    mask_model: str | None = "isnet-general-use",
    use_shading: bool | None = None,
    value_levels: int = 4,
) -> CvResult:
    """Jalankan pipeline. use_shading=None → ditentukan dari shading_hint (AI dapat menimpanya di Fase 3)."""
    t: dict[str, int] = {}
    warnings: list[str] = []

    with _timer(t, "normalize"):
        img = norm.normalize(image_bytes, scope)
    h, w = img.shape[:2]

    with _timer(t, "quality"):
        quality = quality_mod.assess(img)

    mask = None
    if mask_model:
        with _timer(t, "mask"):
            try:
                mask = main_object_mask(img, mask_model)
            except Exception:
                log.exception("mask_failed")
                warnings.append("mask_failed")
        if mask is None and "mask_failed" not in warnings:
            warnings.append("mask_unreliable")  # mis. lukisan ramai tanpa objek tunggal

    method = lineart_method
    with _timer(t, "lineart"):
        try:
            edges = lineart_mod.edge_map(img, method)
        except Exception:
            if method in ("xdog", "canny"):
                raise
            log.exception("lineart_failed", extra={"method": method})
            warnings.append(f"lineart_{method}_failed_fallback_xdog")
            method = "xdog"
            edges = lineart_mod.edge_map(img, method)
        lines = lineart_mod.clean_lines(edges)

    with _timer(t, "regions"):
        seg = segment(img, mask, canvas_size=canvas_size)
    if len(seg.regions) > 35:
        warnings.append("too_complex")

    with _timer(t, "value"):
        hint = value.shading_hint(seg)
        shading = use_shading if use_shading is not None else hint >= SHADING_HINT_THRESHOLD
        value_body = None
        if shading:
            quant = value.value_levels(seg, value_levels)
            value.assign_region_levels(seg, quant)
            value_body = value.value_svg_body(seg, quant)

    with _timer(t, "render"):
        regions_svg = render.regions_svg(seg, w, h)
        sketch = render.sketch_svg(seg, mask, w, h)
        obj_svg = render.main_object_svg(mask, w, h)
        numbered = norm.encode_png(render.numbered_image(seg))
        lines_png = norm.encode_png(lineart_mod.lines_png(lines))
        ai_jpeg = norm.encode_jpeg(norm.resize_max_side(img, norm.AI_MAX_SIDE), quality=88)
        original = norm.encode_jpeg(img)

    t["total"] = sum(v for k, v in t.items())
    return CvResult(
        width=w,
        height=h,
        lineart_method=method,
        mask_model=mask_model if mask is not None else None,
        use_shading=bool(shading),
        shading_hint=hint,
        quality=quality,
        regions=seg.regions,
        lineart_png=lines_png,
        regions_svg=regions_svg,
        sketch_svg=sketch,
        main_object_svg=obj_svg,
        value_svg=render.svg_doc(w, h, value_body, "value") if value_body else None,
        numbered_png=numbered,
        ai_image_jpeg=ai_jpeg,
        original_jpeg=original,
        timings_ms=t,
        warnings=warnings,
    )


def is_blank(img: np.ndarray) -> bool:
    """Bidang hampir polos (bukan karya) — dipakai bersama hasil kualitas untuk 'not_artwork'."""
    return float(img.std()) < 6.0
