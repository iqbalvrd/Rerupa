"""Teks feedback checkpoint (PRD §10, §13; Rencana §3.1 tugas B).

Aturan:
- Maks 2 saran, HANYA dari kandidat hasil ukur CV (cv/compare.py). AI tidak boleh menyebut bagian lain.
- AI hanya menulis kalimat; angka, lokasi, dan penanda berasal dari CV.
- Bila AI tidak diizinkan/tersedia/gagal validasi 2× → templat per jenis kandidat.
"""

import json
import logging
from collections.abc import Callable
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from ai import openai_client as oc
from ai.validators import SHADING_WORDS, _cut

log = logging.getLogger("rerupa.ai")

PROMPT_VERSION = "feedback.v1"
INSTRUCTIONS = (Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
MAX_SUGGESTIONS = 2
LIMITS = {"summary": 200, "observation": 160, "action": 200}


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FeedbackSuggestion(_Strict):
    region_code: str
    observation: str
    action: str


class FeedbackText(_Strict):
    summary: str
    suggestions: list[FeedbackSuggestion]


# ---------------------------------------------------------------- nama bagian

def part_name(code: str, labels: dict[str, str | None]) -> str:
    if code == "main":
        return "objek utama"
    label = labels.get(code)
    return label if label else f"bidang nomor {int(code[1:])}"


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


OPPOSITE = {"kiri": "kanan", "kanan": "kiri", "atas": "bawah", "bawah": "atas"}


def _opposite(direction: str) -> str:
    return " ".join(OPPOSITE.get(w, w) for w in direction.split())


# ---------------------------------------------------------------- templat

def template_suggestion(c: dict, labels: dict[str, str | None]) -> FeedbackSuggestion:
    name = part_name(c["region_code"], labels)
    loc = c.get("location") or ""
    where = f" ({loc})" if loc and loc != "tengah" else ""
    f = c.get("facts") or {}
    kind = c["kind"]
    if kind == "missing_outline":
        obs = f"Garis luar {name}{where} belum terlihat jelas."
        act = "Gambar dulu garis luarnya mengikuti kotak grid sebelum mulai mewarnai."
    elif kind == "shifted":
        amount = "sedikit" if f.get("shift_pct", 0) < 4 else "cukup jauh"
        obs = f"{_cap(name)}{where} tampak bergeser {amount} ke {f.get('direction', 'samping')} dari panduan."
        act = f"Cocokkan posisinya dengan garis grid terdekat, lalu geser garisnya ke {_opposite(f.get('direction', 'samping'))}."
    elif kind in ("too_wide", "too_narrow", "too_tall", "too_short"):
        word = {"too_wide": "lebih lebar", "too_narrow": "lebih sempit", "too_tall": "lebih tinggi", "too_short": "lebih pendek"}[kind]
        side = f.get("side", "kedua sisi")
        if side == "kedua sisi":
            obs = f"{_cap(name)}{where} tampak {word} dari panduan."
            fix = "rapatkan" if kind in ("too_wide", "too_tall") else "lebarkan"
            act = f"Periksa titik potong garis dengan grid, lalu {fix} kedua sisinya sebelum mengisi warna."
        else:
            obs = f"Sisi {side} {name} tampak {word} dari panduan."
            act = f"Periksa garis bantu di sisi {side}, lalu perbaiki garisnya sebelum mengisi warna."
    elif kind == "unfilled":
        obs = f"{_cap(name)}{where} baru terisi sekitar {f.get('fill_pct', 0)}%."
        act = "Ratakan cat ke seluruh bidang ini sebelum lanjut ke tahap berikutnya."
    elif kind == "too_light":
        obs = f"{_cap(name)}{where} tampak lebih terang dari panduan."
        act = "Campur lagi sesuai resep dengan sedikit warna yang lebih gelap, uji dulu di kertas."
    elif kind == "too_dark":
        obs = f"{_cap(name)}{where} tampak lebih gelap dari panduan."
        act = "Campur lagi sesuai resep dengan sedikit putih, uji dulu di kertas."
    else:
        obs = f"{_cap(name)}{where} perlu diperiksa lagi."
        act = "Bandingkan bagian ini dengan panduan sebelum lanjut."
    return FeedbackSuggestion(region_code=c["region_code"], observation=obs, action=act)


def template_summary(stage_kind: str, candidates: list[dict], metrics: dict) -> str:
    sketch = stage_kind == "sketch"
    if not candidates:
        return "Bentuk besar sudah sesuai panduan. Lanjutkan ke tahap berikutnya." if sketch else "Bidang warna sudah sesuai panduan. Lanjutkan ke tahap berikutnya."
    if sketch:
        recall = metrics.get("line_recall") or 0
        lead = "Bentuk utama sudah terbaca." if recall >= 0.5 else "Sebagian bentuk sudah terbaca."
        return f"{lead} Periksa hal berikut sebelum mulai mewarnai."
    return "Sebagian besar bidang sudah dikerjakan. Periksa hal berikut sebelum lanjut."


def template_feedback(stage_kind: str, candidates: list[dict], metrics: dict, labels: dict[str, str | None]) -> FeedbackText:
    return FeedbackText(
        summary=template_summary(stage_kind, candidates, metrics),
        suggestions=[template_suggestion(c, labels) for c in candidates[:MAX_SUGGESTIONS]],
    )


# ---------------------------------------------------------------- validasi

def find_errors(out: FeedbackText, candidate_codes: list[str], use_shading: bool) -> list[str]:
    errors = []
    if not out.summary.strip():
        errors.append("summary wajib diisi")
    if len(out.suggestions) > MAX_SUGGESTIONS:
        errors.append(f"maksimal {MAX_SUGGESTIONS} saran")
    if candidate_codes and not out.suggestions:
        errors.append("ada kandidat masalah; tulis minimal 1 saran")
    if not candidate_codes and out.suggestions:
        errors.append("tidak ada kandidat masalah; suggestions harus kosong")
    seen = set()
    for s in out.suggestions:
        if s.region_code not in candidate_codes:
            errors.append(f"region_code {s.region_code} bukan kandidat; pilih dari {candidate_codes}")
        if s.region_code in seen:
            errors.append(f"region_code {s.region_code} dipakai dua kali")
        seen.add(s.region_code)
        if not s.observation.strip() or not s.action.strip():
            errors.append(f"{s.region_code}: observation dan action wajib diisi")
        if not use_shading and SHADING_WORDS.search(f"{s.observation} {s.action}"):
            errors.append(f"{s.region_code}: karya ini datar, jangan menyuruh membuat bayangan/gradasi/volume")
    return errors


def sanitize(out: FeedbackText, candidate_codes: list[str], use_shading: bool) -> FeedbackText:
    kept, seen = [], set()
    for s in out.suggestions:
        if s.region_code not in candidate_codes or s.region_code in seen:
            continue
        if not use_shading and SHADING_WORDS.search(f"{s.observation} {s.action}"):
            continue
        if not s.observation.strip() or not s.action.strip():
            continue
        seen.add(s.region_code)
        kept.append(FeedbackSuggestion(region_code=s.region_code, observation=_cut(s.observation, LIMITS["observation"]), action=_cut(s.action, LIMITS["action"])))
    return FeedbackText(summary=_cut(out.summary, LIMITS["summary"]), suggestions=kept[:MAX_SUGGESTIONS])


# ---------------------------------------------------------------- penulis

def write_feedback(
    *,
    stage_kind: str,
    stage_title: str,
    candidates: list[dict],
    metrics: dict,
    labels: dict[str, str | None],
    use_shading: bool,
    overlay_jpeg: bytes | None,
    use_ai: bool,
    safety_id: str,
    job_id: str | None,
    still_allowed: Callable[[], bool] = lambda: True,
) -> tuple[FeedbackText, str, list[str]]:
    """Return (teks, 'ai'|'template', catatan). Tidak pernah melempar karena AI."""
    fallback = template_feedback(stage_kind, candidates, metrics, labels)
    if not candidates:
        return fallback, "template", ["no_candidates"]  # tidak ada yang perlu dikoreksi → tak perlu AI
    if not use_ai or overlay_jpeg is None:
        return fallback, "template", ["ai_not_allowed"]
    try:
        oc.ensure_available()
    except oc.AIUnavailable as exc:
        return fallback, "template", [exc.code]

    codes = [c["region_code"] for c in candidates]
    data = {
        "stage": {"kind": stage_kind, "title": stage_title},
        "use_shading": use_shading,
        "candidates": [
            {
                "region_code": c["region_code"],
                "name": part_name(c["region_code"], labels),
                "kind": c["kind"],
                "facts": c.get("facts", {}),
                "location": c.get("location"),
                "template": template_suggestion(c, labels).model_dump(),
            }
            for c in candidates
        ],
    }
    content = [
        {"type": "input_text", "text": "Data checkpoint (JSON):\n" + json.dumps(data, ensure_ascii=False)},
        {"type": "input_text", "text": "Gambar: foto progres yang sudah diluruskan; garis merah = panduan, kotak bernomor = kandidat."},
        oc.image_part(overlay_jpeg, "image/jpeg"),
    ]
    last: FeedbackText | None = None
    for attempt in (1, 2):
        if not still_allowed():
            return fallback, "template", ["session_deleted"]
        try:
            result = oc.parse(task="feedback", instructions=INSTRUCTIONS, content=content, schema=FeedbackText, safety_id=safety_id, job_id=job_id, max_output_tokens=1200)
        except oc.AIUnavailable as exc:
            if last is not None:
                break
            return fallback, "template", [exc.code]
        last = result.parsed
        errors = find_errors(last, codes, use_shading)
        if not errors:
            return sanitize(last, codes, use_shading), "ai", []
        log.info("ai_feedback_invalid", extra={"attempt": attempt, "error_count": len(errors)})
        content = content + [{"type": "input_text", "text": "Keluaranmu melanggar aturan berikut. Perbaiki dan kirim ulang lengkap:\n- " + "\n- ".join(errors)}]

    out = sanitize(last, codes, use_shading)
    if not out.suggestions:
        return fallback, "template", ["retry_failed"]
    return out, "ai", ["retry_failed_sanitized"]
