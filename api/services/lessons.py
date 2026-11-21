"""Merakit dan menyimpan satu tutorial: unggah lapisan ke Storage lalu simpan semua baris secara
atomik lewat RPC create_lesson. Bila penyimpanan DB gagal, file yang sudah diunggah dihapus lagi."""

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict

from ai.schemas import LessonText
from core.supabase_client import get_supabase
from cv.stage_planner import PlannedStage
from cv.types import CvResult
from services.storage import is_duplicate, with_retry

log = logging.getLogger("rerupa.lessons")


def grid_svg(width: int, height: int, cells_short_side: int = 4) -> tuple[str, dict]:
    """Grid kotak hampir persegi: sisi pendek dibagi 4."""
    cell = min(width, height) / cells_short_side
    cols, rows = max(1, round(width / cell)), max(1, round(height / cell))
    lines = [f'<line x1="{width * i / cols:.1f}" y1="0" x2="{width * i / cols:.1f}" y2="{height}"/>' for i in range(1, cols)]
    lines += [f'<line x1="0" y1="{height * j / rows:.1f}" x2="{width}" y2="{height * j / rows:.1f}"/>' for j in range(1, rows)]
    body = f'<g stroke="#9A9A9A" stroke-width="1.5" stroke-dasharray="6 6">{"".join(lines)}</g>'
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" data-layer="grid">{body}</svg>'
    return svg, {"cols": cols, "rows": rows}


def upload_layers(cv: CvResult, bucket: str, prefix: str) -> list[dict]:
    """Unggah semua lapisan; return daftar layer untuk create_lesson."""
    storage = get_supabase().storage.from_(bucket)
    grid, grid_meta = grid_svg(cv.width, cv.height)
    files: list[tuple[str, str, bytes, str, str, dict]] = [
        ("grid", "grid.svg", grid.encode(), "image/svg+xml", "svg", grid_meta),
        ("sketch", "sketch.svg", cv.sketch_svg.encode(), "image/svg+xml", "svg", {}),
        ("regions", "regions.svg", cv.regions_svg.encode(), "image/svg+xml", "svg", {}),
        ("lineart", "lineart.png", cv.lineart_png, "image/png", "png", {"method": cv.lineart_method}),
        ("original_photo", "original.jpg", cv.original_jpeg, "image/jpeg", "jpeg", {}),
    ]
    if cv.main_object_svg:
        files.append(("main_object", "main_object.svg", cv.main_object_svg.encode(), "image/svg+xml", "svg", {}))
    if cv.value_svg:
        files.append(("value", "value.svg", cv.value_svg.encode(), "image/svg+xml", "svg", {"levels": 4}))

    def put(item: tuple) -> dict:
        kind, name, data, mime, fmt, meta = item
        path = f"{prefix}/{name}"
        with_retry(lambda: storage.upload(path, data, {"content-type": mime, "upsert": "true"}), "upload_layer", already_done=is_duplicate)
        return {"kind": kind, "bucket": bucket, "asset_path": path, "format": fmt, "meta": meta}

    # Paralel: 6–7 berkas kecil; menunggu satu per satu menghabiskan beberapa detik untuk bolak-balik jaringan.
    with ThreadPoolExecutor(max_workers=len(files)) as pool:
        return list(pool.map(put, files))


def remove_layers(layers: list[dict]) -> None:
    by_bucket: dict[str, list[str]] = {}
    for layer in layers:
        by_bucket.setdefault(layer["bucket"], []).append(layer["asset_path"])
    for bucket, paths in by_bucket.items():
        try:
            with_retry(lambda b=bucket, p=paths: get_supabase().storage.from_(b).remove(p), "remove_layers")
        except Exception:
            log.exception("remove_layers_failed")


def build_payload(
    cv: CvResult,
    stages: list[PlannedStage],
    text: LessonText,
    text_source: str,
    layers: list[dict],
    *,
    lesson: dict,
    session_id: str | None,
    extra_claims: list[dict] | None = None,
    region_colors: list[dict] | None = None,
) -> dict:
    labels = {lbl.region_code: lbl.label for lbl in text.region_labels}
    texts = {t.stage_code: t for t in text.stages}
    regions = []
    for r in cv.regions:
        d = asdict(r)
        d.pop("path_svg")
        d["label"] = labels.get(r.code)
        regions.append(d)

    stage_rows = []
    for s in stages:
        t = texts[s.code]
        stage_rows.append(
            {
                "code": s.code,
                "order_no": s.order_no,
                "kind": s.kind,
                "layers": s.layers,
                "is_checkpoint": s.is_checkpoint,
                "title": t.title,
                "action": t.action,
                "tools": t.tools,
                "done_when": t.done_when,
                "common_mistakes": t.common_mistakes,
                "focus_bbox": s.focus_bbox,
                "text_source": text_source,
                "region_codes": s.region_codes,
            }
        )

    claims = [
        {"text": c.text, "type": c.type, "order_no": i, "stage_code": c.stage_code, "source_codes": c.source_codes}
        for i, c in enumerate(text.culture_claims)
    ]
    for c in extra_claims or []:
        claims.append({**c, "order_no": len(claims)})

    reflection = None
    if text.reflection is not None:
        reflection = {
            "question": text.reflection.question,
            "options": text.reflection.options,
            "correct_option": text.reflection.correct_index,
            "answer_source_code": text.reflection.answer_source_code,
        }

    return {
        "lesson": {
            **lesson,
            "image_width": cv.width,
            "image_height": cv.height,
            "use_shading": cv.use_shading,
            "style": {**text.style.model_dump(), "shading_hint": round(cv.shading_hint, 3), "warnings": cv.warnings},
            "lineart_method": cv.lineart_method,
            "skill_goal": text.skill_goal or None,
            "culture_goal": text.culture_goal or None,
            "ai_text_status": text_source,
        },
        "regions": regions,
        "layers": layers,
        "stages": stage_rows,
        "claims": claims,
        "reflection": reflection,
        "region_colors": region_colors or [],
        "session_id": session_id,
    }


def save_lesson(payload: dict, layers: list[dict]) -> str:
    """Simpan atomik. Gagal → hapus file lapisan yang sudah diunggah, lalu lempar ulang."""
    try:
        return get_supabase().rpc("create_lesson", {"p": payload}).execute().data
    except Exception:
        remove_layers(layers)
        raise
