"""Storyboard 4–6 panel dari klaim (bersumber/perkiraan) + validator aturan PRD FR16 & §11.2."""

import json
import logging
from pathlib import Path

from ai import openai_client as oc
from story.schemas import BEAT_ORDER, Storyboard

log = logging.getLogger("rerupa.story")

PROMPTS = Path(__file__).parent / "prompts"
PROMPT_VERSION = "storyboard.v2"
MIN_PANELS, MAX_PANELS = 4, 6
MAX_WORDS = 40
MAX_CHARACTERS = 4
RESTRICTED_FILE = Path(__file__).parent / "restricted.json"  # di dalam api/ agar ikut image Docker


def restricted_names() -> list[str]:
    """Tokoh/adegan yang tidak boleh digambar (daftar dari narasumber, api/story/restricted.json)."""
    try:
        data = json.loads(RESTRICTED_FILE.read_text(encoding="utf-8"))
        return [n.strip() for n in data.get("figures", []) if n.strip()]
    except FileNotFoundError:
        return []


def find_errors(sb: Storyboard, region_codes: set[str], restricted: list[str], arc: bool = True) -> list[str]:
    """arc=False: alur seniman→inspirasi→kisah→makna tidak dicek (diminta saat retry, tetapi tidak menggagalkan cerita)."""
    errors = []
    n = len(sb.panels)
    if not MIN_PANELS <= n <= MAX_PANELS:
        errors.append(f"jumlah panel harus {MIN_PANELS}–{MAX_PANELS}, diterima {n}")
    if [p.order_no for p in sb.panels] != list(range(1, n + 1)):
        errors.append("order_no panel harus berurutan mulai 1")
    if not 1 <= len(sb.characters) <= MAX_CHARACTERS:
        errors.append(f"jumlah tokoh harus 1–{MAX_CHARACTERS}")
    codes = [c.code for c in sb.characters]
    if len(set(codes)) != len(codes):
        errors.append("kode tokoh harus unik")
    for c in sb.characters:
        bad = set(c.region_codes) - region_codes
        if bad:
            errors.append(f"tokoh {c.code}: region tidak ada {sorted(bad)}")
        if not c.description.strip():
            errors.append(f"tokoh {c.code}: description wajib diisi")
    for p in sb.panels:
        words = len(p.narration.split())
        if not p.narration.strip() or words > MAX_WORDS:
            errors.append(f"panel {p.order_no}: narration wajib 1–{MAX_WORDS} kata (diterima {words})")
        unknown = set(p.character_codes) - set(codes)
        if unknown:
            errors.append(f"panel {p.order_no}: tokoh tidak dikenal {sorted(unknown)}")
        bad = set(p.focus_region_codes) - region_codes
        if bad:
            errors.append(f"panel {p.order_no}: region tidak ada {sorted(bad)}")
        if not p.use_artwork_crop and not p.scene.strip():
            errors.append(f"panel {p.order_no}: scene wajib diisi")
    beats = [p.beat for p in sb.panels] if arc else []
    if beats and beats[0] not in ("seniman", "inspirasi"):
        errors.append("panel pertama harus beat seniman atau inspirasi (siapa pembuatnya / apa yang mengilhaminya)")
    if beats and beats[-1] != "makna":
        errors.append("panel terakhir harus beat makna")
    if beats and ("inspirasi" not in beats or "kisah" not in beats):
        errors.append("storyline wajib punya beat inspirasi dan minimal satu beat kisah")
    if [BEAT_ORDER.index(b) for b in beats] != sorted(BEAT_ORDER.index(b) for b in beats):
        errors.append("urutan beat harus seniman → inspirasi → kisah → makna")
    text = " ".join([c.name for c in sb.characters] + [p.scene for p in sb.panels]).lower()
    for name in restricted:
        if name.lower() in text:
            errors.append(f"'{name}' ada dalam daftar terbatas: jangan ditampilkan sebagai tokoh atau adegan")
    return errors


def sanitize(sb: Storyboard, region_codes: set[str]) -> Storyboard:
    """Perbaikan aman setelah retry: potong narasi, buang kode yang tidak valid, batasi jumlah."""
    chars = sb.characters[:MAX_CHARACTERS]
    codes = {c.code for c in chars}
    chars = [c.model_copy(update={"region_codes": [r for r in c.region_codes if r in region_codes]}) for c in chars]
    panels = []
    ordered = sorted(sb.panels[:MAX_PANELS], key=lambda p: BEAT_ORDER.index(p.beat))  # stabil: urutan dalam beat tetap
    for i, p in enumerate(ordered, start=1):
        words = p.narration.split()
        panels.append(p.model_copy(update={
            "order_no": i,
            "narration": " ".join(words[:MAX_WORDS]),
            "character_codes": [c for c in p.character_codes if c in codes],
            "focus_region_codes": [r for r in p.focus_region_codes if r in region_codes],
        }))
    return sb.model_copy(update={"characters": chars, "panels": panels})


def write_storyboard(*, basis: str, identity: dict, claims: list[dict], regions: list[dict], image_jpeg: bytes | None, safety_id: str, job_id: str | None) -> Storyboard:
    """Return storyboard tervalidasi. Melempar oc.AIUnavailable bila AI gagal, ValueError bila tetap tidak valid."""
    restricted = restricted_names()
    region_codes = {r["code"] for r in regions}
    data = {
        "story_basis": basis,
        "identity": identity,
        "claims": claims,
        "regions": [{k: r.get(k) for k in ("code", "label", "hex", "area_pct", "is_main_object")} for r in regions],
        "restricted": restricted,
    }
    content: list[dict] = [{"type": "input_text", "text": "Data (JSON):\n" + json.dumps(data, ensure_ascii=False)}]
    if image_jpeg:
        content.append(oc.image_part(image_jpeg, "image/jpeg", detail="low"))
    instructions = (PROMPTS / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
    last = None
    for attempt in (1, 2):
        res = oc.parse(task="storyboard", instructions=instructions, content=content, schema=Storyboard, safety_id=safety_id, job_id=job_id, max_output_tokens=4000)
        last = res.parsed
        errors = find_errors(last, region_codes, restricted)
        if not errors:
            return last
        log.info("storyboard_invalid", extra={"attempt": attempt, "error_count": len(errors)})
        content = content + [{"type": "input_text", "text": "Perbaiki pelanggaran berikut dan kirim ulang lengkap:\n- " + "\n- ".join(errors)}]
    fixed = sanitize(last, region_codes)
    errors = find_errors(fixed, region_codes, restricted, arc=False)
    if errors:
        raise ValueError("storyboard_invalid: " + "; ".join(errors[:3]))
    return fixed
