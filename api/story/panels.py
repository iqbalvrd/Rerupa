"""Panel storyline: potongan karya asli, atau gambar OpenAI + pemeriksa konsistensi (PRD FR16, RENCANA §4.8).

- use_artwork_crop → potongan foto karya (bidang fokus), tidak digambar ulang.
- Selain itu gambar dibuat dari prompt + referensi (karya, panel sebelumnya) dengan gaya karya.
- Pemeriksa (vision) mengecek tokoh, atribut budaya, teks, dan konten. Gagal → regenerasi 1× dengan
  daftar masalah. Masih gagal, ditolak moderasi, atau batas biaya habis → kartu teks (narasi saja).
"""

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from ai import openai_client as oc
from story.schemas import Character, Panel, PanelCheck, Storyboard

log = logging.getLogger("rerupa.story")

PROMPTS = Path(__file__).parent / "prompts"
PANEL_SIDE = 1024


@dataclass
class PanelResult:
    order_no: int
    kind: str  # generated | artwork_crop | text
    status: str  # ready | text_only
    jpeg: bytes | None = None
    check: dict = field(default_factory=dict)


def to_jpeg(data: bytes, max_side: int = PANEL_SIDE, quality: int = 85) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        return buf.getvalue()


def to_png(data: bytes, max_side: int = PANEL_SIDE) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        return buf.getvalue()


def crop_regions(original_jpeg: bytes, bboxes: list[list[int]], pad: float = 0.12) -> bytes:
    """Potongan karya asli yang mencakup semua bidang fokus (koordinat lesson = ukuran foto asli lesson)."""
    with Image.open(io.BytesIO(original_jpeg)) as img:
        img = img.convert("RGB")
        if bboxes:
            x0 = min(b[0] for b in bboxes)
            y0 = min(b[1] for b in bboxes)
            x1 = max(b[0] + b[2] for b in bboxes)
            y1 = max(b[1] + b[3] for b in bboxes)
            pw, ph = (x1 - x0) * pad, (y1 - y0) * pad
            box = (max(0, int(x0 - pw)), max(0, int(y0 - ph)), min(img.width, int(x1 + pw)), min(img.height, int(y1 + ph)))
            if box[2] - box[0] >= 64 and box[3] - box[1] >= 64:
                img = img.crop(box)
        buf = io.BytesIO()
        img.thumbnail((PANEL_SIDE, PANEL_SIDE))
        img.save(buf, "JPEG", quality=88, optimize=True)
        return buf.getvalue()


def panel_prompt(sb: Storyboard, panel: Panel, fix: list[str] | None = None) -> str:
    chars = {c.code: c for c in sb.characters}
    lines = [
        f"Gaya: {sb.style_guide} Ikuti gaya, palet, dan teknik gambar referensi pertama (karya asli).",
        f"Adegan: {panel.scene}",
    ]
    for code in panel.character_codes:
        c: Character | None = chars.get(code)
        if c:
            lines.append(f"Tokoh {c.name}: {c.description} (ciri ini tetap sama di semua panel).")
    lines.append("Jangan menambahkan tulisan, huruf, atau angka. Jangan menambah senjata, simbol, atau atribut budaya yang tidak disebut.")
    if fix:
        lines.append("Perbaiki masalah panel sebelumnya: " + "; ".join(fix))
    return "\n".join(lines)


def check_panel(sb: Storyboard, panel: Panel, panel_jpeg: bytes, original_jpeg: bytes, *, safety_id: str, job_id: str | None) -> PanelCheck:
    chars = [c.model_dump() for c in sb.characters if c.code in panel.character_codes]
    content = [
        {"type": "input_text", "text": f"Tokoh (dikunci): {chars}\nAdegan: {panel.scene}\nGaya: {sb.style_guide}\nGambar 1: panel baru. Gambar 2: karya asli."},
        oc.image_part(panel_jpeg, "image/jpeg", detail="low"),
        oc.image_part(original_jpeg, "image/jpeg", detail="low"),
    ]
    return oc.parse(task="panel_check", instructions=(PROMPTS / "panel_check.v1.md").read_text(encoding="utf-8"), content=content, schema=PanelCheck, safety_id=safety_id, job_id=job_id, max_output_tokens=600).parsed


def make_panel(sb: Storyboard, panel: Panel, *, original_jpeg: bytes, region_bbox: dict[str, list[int]], previous_png: bytes | None, image_model: str, quality: str, safety_id: str, job_id: str | None, crop_repeats: dict | None = None) -> PanelResult:
    if panel.use_artwork_crop:
        boxes = [region_bbox[c] for c in panel.focus_region_codes if c in region_bbox]
        # Bidang fokus yang sama dengan panel potongan sebelumnya → bingkai lebih lebar, lalu karya utuh,
        # supaya dua panel berurutan tidak menampilkan gambar yang hampir sama.
        repeat = crop_repeats.get(tuple(sorted(panel.focus_region_codes)), 0) if crop_repeats is not None else 0
        if crop_repeats is not None:
            crop_repeats[tuple(sorted(panel.focus_region_codes))] = repeat + 1
        if repeat >= 2:
            boxes = []
        return PanelResult(panel.order_no, "artwork_crop", "ready", crop_regions(original_jpeg, boxes, pad=0.12 if repeat == 0 else 0.8))

    refs = [to_png(original_jpeg)] + ([previous_png] if previous_png else [])
    fix: list[str] | None = None
    last_check: dict = {}
    for attempt in (1, 2):  # regenerasi maks 1×
        try:
            oc.ensure_available()  # batas biaya harian dicek sebelum setiap gambar
            png = oc.edit_image(task="story_panel", prompt=panel_prompt(sb, panel, fix), references=refs, safety_id=safety_id, job_id=job_id, model=image_model, quality=quality)
        except oc.AIUnavailable as exc:
            return PanelResult(panel.order_no, "text", "text_only", check={"error": exc.code})
        jpeg = to_jpeg(png)
        try:
            check = check_panel(sb, panel, jpeg, original_jpeg, safety_id=safety_id, job_id=job_id)
        except oc.AIUnavailable:
            # Pemeriksa tidak tersedia: panel dipakai dengan catatan (label "Ilustrasi AI" tetap tampil).
            return PanelResult(panel.order_no, "generated", "ready", jpeg, {"checked": False, "attempts": attempt})
        last_check = {"checked": True, "consistent": check.consistent, "issues": check.issues, "attempts": attempt}
        if check.consistent:
            return PanelResult(panel.order_no, "generated", "ready", jpeg, last_check)
        fix = check.issues
        log.info("panel_inconsistent", extra={"order_no": panel.order_no, "attempt": attempt, "issues": len(check.issues)})
    return PanelResult(panel.order_no, "text", "text_only", check=last_check)
