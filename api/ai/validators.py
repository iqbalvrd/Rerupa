"""Validasi keluaran AI terhadap aturan PRD (§13) dan Rencana (§4.4).

Dua tingkat:
- errors   : pelanggaran yang membuat AI perlu diminta ulang (dikirim balik sebagai daftar error).
- sanitize : setelah retry, perbaikan paksa yang aman (potong teks, turunkan klaim tanpa sumber
             menjadi perkiraan, ganti teks tahap yang hilang dengan templat).
"""

import re

from ai.schemas import CultureClaim, LessonText, Reflection, StageText
from ai.templates import stage_text_for
from cv.stage_planner import PlannedStage

LIMITS = {"title": 60, "action": 260, "done_when": 200, "mistake": 160, "label": 60, "claim": 280, "tool": 40}
MAX_TOOLS = 5
MAX_MISTAKES = 2
MAX_CLAIMS = 5

# Kata yang menyuruh membuat volume/bayangan — dilarang bila use_shading = false (karya datar).
SHADING_WORDS = re.compile(r"\b(shading|bayangan|gradasi|volume|volumetrik|bervolume|gelap[- ]terang|terang[- ]gelap)\b", re.I)


def find_errors(
    out: LessonText,
    stages: list[PlannedStage],
    region_codes: set[str],
    source_codes: set[str],
    use_shading: bool,
) -> list[str]:
    errors: list[str] = []
    expected = [s.code for s in stages]
    got = [t.stage_code for t in out.stages]
    if sorted(got) != sorted(expected) or len(got) != len(set(got)):
        errors.append(f"stages harus berisi tepat satu teks untuk tiap kode: {expected}; diterima: {got}")

    for t in out.stages:
        if not t.title.strip() or not t.action.strip() or not t.done_when.strip():
            errors.append(f"{t.stage_code}: title, action, dan done_when wajib diisi")
        if not use_shading:
            text = " ".join([t.title, t.action, t.done_when, *t.common_mistakes])
            if SHADING_WORDS.search(text):
                errors.append(f"{t.stage_code}: karya ini datar (use_shading=false), jangan menyuruh membuat bayangan/gradasi/volume")

    for lbl in out.region_labels:
        if lbl.region_code not in region_codes:
            errors.append(f"region_labels memakai kode yang tidak ada: {lbl.region_code}")

    for c in out.culture_claims:
        if c.type == "fakta":
            if not c.source_codes:
                errors.append(f"klaim fakta tanpa source_codes: {c.text[:60]}")
            unknown = set(c.source_codes) - source_codes
            if unknown:
                errors.append(f"source_codes tidak dikenal: {sorted(unknown)}")
        if c.stage_code is not None and c.stage_code not in expected:
            errors.append(f"stage_code klaim tidak ada: {c.stage_code}")

    r = out.reflection
    if r is not None:
        if r.answer_source_code not in source_codes:
            errors.append("reflection.answer_source_code harus dari daftar sumber; bila tidak ada sumber, isi reflection dengan null")
        if not (3 <= len(r.options) <= 4) or not (0 <= r.correct_index < len(r.options)):
            errors.append("reflection butuh 3–4 pilihan dan correct_index yang valid")
    return errors


def sanitize(
    out: LessonText,
    stages: list[PlannedStage],
    region_codes: set[str],
    source_codes: set[str],
    use_shading: bool,
) -> tuple[LessonText, list[str]]:
    """Perbaikan paksa yang aman. Return (hasil, daftar perbaikan yang dilakukan)."""
    fixes: list[str] = []
    by_code = {t.stage_code: t for t in out.stages}
    texts: list[StageText] = []
    for s in stages:
        t = by_code.get(s.code)
        bad = t is None or not t.title.strip() or not t.action.strip() or not t.done_when.strip()
        if not bad and not use_shading and SHADING_WORDS.search(" ".join([t.title, t.action, t.done_when, *t.common_mistakes])):
            bad = True
        if bad:
            fixes.append(f"{s.code}: teks diganti templat")
            texts.append(stage_text_for(s))
            continue
        texts.append(
            StageText(
                stage_code=s.code,
                title=_cut(t.title, LIMITS["title"]),
                action=_cut(t.action, LIMITS["action"]),
                tools=[_cut(x, LIMITS["tool"]) for x in t.tools if x.strip()][:MAX_TOOLS],
                done_when=_cut(t.done_when, LIMITS["done_when"]),
                common_mistakes=[_cut(x, LIMITS["mistake"]) for x in t.common_mistakes if x.strip()][:MAX_MISTAKES],
            )
        )

    labels = [l.model_copy(update={"label": _cut(l.label, LIMITS["label"])}) for l in out.region_labels if l.region_code in region_codes]
    if len(labels) != len(out.region_labels):
        fixes.append("label region dengan kode tak dikenal dibuang")

    claims: list[CultureClaim] = []
    stage_codes = {s.code for s in stages}
    for c in out.culture_claims[:MAX_CLAIMS]:
        valid_sources = [x for x in c.source_codes if x in source_codes]
        ctype = c.type
        if ctype == "fakta" and not valid_sources:
            ctype = "perkiraan"  # tidak ada sumber sah → tidak boleh tampil sebagai fakta
            fixes.append("klaim fakta tanpa sumber sah diturunkan menjadi perkiraan")
        claims.append(
            CultureClaim(
                text=_cut(c.text, LIMITS["claim"]),
                type=ctype,
                source_codes=valid_sources if ctype == "fakta" else [],
                stage_code=c.stage_code if c.stage_code in stage_codes else None,
            )
        )

    reflection: Reflection | None = out.reflection
    if reflection is not None and (
        reflection.answer_source_code not in source_codes
        or not (3 <= len(reflection.options) <= 4)
        or not (0 <= reflection.correct_index < len(reflection.options))
    ):
        reflection = None
        fixes.append("refleksi tanpa sumber sah dibuang")

    return (
        LessonText(
            style=out.style,
            skill_goal=_cut(out.skill_goal, 200),
            culture_goal=_cut(out.culture_goal, 200),
            stages=texts,
            region_labels=labels,
            culture_claims=claims,
            reflection=reflection,
        ),
        fixes,
    )


def _cut(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
