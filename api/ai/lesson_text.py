"""Menyusun teks tutorial: AI (bila diizinkan & tersedia) → validasi → retry 1× → perbaikan aman,
dengan templat sebagai cadangan di setiap jalur gagal. Tahapan visual tidak pernah bergantung pada AI."""

import json
import logging
from collections.abc import Callable
from pathlib import Path

from ai import openai_client as oc
from ai.knowledge import load_culture_kb
from ai.schemas import LessonText
from ai.templates import template_lesson_text
from ai.validators import find_errors, sanitize
from cv.stage_planner import PlannedStage
from cv.types import CvResult

log = logging.getLogger("rerupa.ai")

PROMPT_VERSION = "stage_text.v1"
PROMPT_VERSION_V2 = "stage_text.v2"  # tutorial bertahap (langkah punya `phase`)
_PROMPTS = Path(__file__).parent / "prompts"
INSTRUCTIONS = (_PROMPTS / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
INSTRUCTIONS_V2 = (_PROMPTS / f"{PROMPT_VERSION_V2}.md").read_text(encoding="utf-8")


def is_v2(stages: list[PlannedStage]) -> bool:
    return any(s.phase for s in stages)


def prompt_version(stages: list[PlannedStage]) -> str:
    return PROMPT_VERSION_V2 if is_v2(stages) else PROMPT_VERSION


def build_payload(cv: CvResult, stages: list[PlannedStage], kb: list[dict], mixes: dict[str, dict] | None = None) -> dict:
    stage_of = {c: s.code for s in stages for c in s.region_codes}
    v2 = is_v2(stages)
    stage_rows = []
    for s in stages:
        row = {"code": s.code, "order": s.order_no, "kind": s.kind, "region_codes": s.region_codes, "is_checkpoint": s.is_checkpoint}
        if v2:
            row.update(phase=s.phase, grid_cells=s.grid_cells, mix_id=s.mix_id, new_lines=s.new_lines)
        stage_rows.append(row)
    out = {
        "use_shading": cv.use_shading,
        "image": {"width": cv.width, "height": cv.height},
        "stages": stage_rows,
        "regions": [
            {"code": r.code, "number": int(r.code[1:]), "hex": r.hex, "area_pct": r.area_pct, "is_main_object": r.is_main_object, "is_background": r.is_background, "stage_code": stage_of.get(r.code)}
            for r in cv.regions
        ],
        "culture_knowledge_base": kb,
    }
    if v2:
        out["mixes"] = [{"mix_id": k, **v} for k, v in (mixes or {}).items()]
        out["landmarks"] = [{"no": p["no"], "grid_cell": p["grid_cell"]} for p in cv.landmarks]
    return out


def write_lesson_text(
    cv: CvResult,
    stages: list[PlannedStage],
    *,
    use_ai: bool,
    safety_id: str,
    job_id: str | None,
    still_allowed: Callable[[], bool] = lambda: True,
    mixes: dict[str, dict] | None = None,
) -> tuple[LessonText, str, list[str]]:
    """Return (teks, sumber 'ai'|'template', catatan). Tidak pernah melempar karena AI.
    `mixes` (v2): {mix_id: {"order_no", "name"}} untuk teks langkah campuran."""
    landmark_cells = [p["grid_cell"] for p in cv.landmarks]
    fallback = template_lesson_text(stages, cv.use_shading, mixes, landmark_cells)
    if not use_ai:
        return fallback, "template", ["ai_not_allowed"]
    try:
        oc.ensure_available()
    except oc.AIUnavailable as exc:
        return fallback, "template", [exc.code]

    kb, source_codes = load_culture_kb()
    region_codes = {r.code for r in cv.regions}
    content = [
        {"type": "input_text", "text": "Data tutorial (JSON):\n" + json.dumps(build_payload(cv, stages, kb), ensure_ascii=False)},
        {"type": "input_text", "text": "Gambar 1: foto karya. Gambar 2: region bernomor."},
        oc.image_part(cv.ai_image_jpeg, "image/jpeg"),
        oc.image_part(cv.numbered_png, "image/png"),
    ]

    last: LessonText | None = None
    for attempt in (1, 2):
        # Cek ulang sebelum foto dikirim: sesi bisa saja dihapus saat job berjalan.
        if not still_allowed():
            return fallback, "template", ["session_deleted"]
        try:
            result = oc.parse(
                task="stage_text",
                instructions=INSTRUCTIONS_V2 if is_v2(stages) else INSTRUCTIONS,
                content=content,
                schema=LessonText,
                safety_id=safety_id,
                job_id=job_id,
            )
        except oc.AIUnavailable as exc:
            if last is not None:
                break  # retry gagal → pakai hasil pertama yang diperbaiki paksa
            return fallback, "template", [exc.code]
        last = result.parsed
        errors = find_errors(last, stages, region_codes, source_codes, cv.use_shading, set(landmark_cells))
        if not errors:
            out, fixes = sanitize(last, stages, region_codes, source_codes, cv.use_shading, mixes, landmark_cells)
            return out, "ai", fixes
        log.info("ai_output_invalid", extra={"attempt": attempt, "error_count": len(errors)})
        content = content + [
            {"type": "input_text", "text": "Keluaranmu sebelumnya melanggar aturan berikut. Perbaiki dan kirim ulang lengkap:\n- " + "\n- ".join(errors)}
        ]

    out, fixes = sanitize(last, stages, region_codes, source_codes, cv.use_shading, mixes, landmark_cells)
    return out, "ai", ["retry_failed_sanitized", *fixes]
