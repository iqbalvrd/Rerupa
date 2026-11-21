"""Impor satu materi koleksi dari folder content/artworks/<slug>/ ke database + Storage.

Jalankan dari folder api/:
    uv run --group cv python scripts/import_collection.py ../content/artworks/<slug>
    uv run --group cv python scripts/import_collection.py ../content/artworks/<slug> --publish

Isi folder: meta.json + file gambar (lihat content/README.md untuk format).
- Gambar karya diunggah ke bucket `catalog` (artworks/<slug>/…).
- Pipeline CV memakai LINEART_METHOD_COLLECTION (kualitas lebih penting daripada kecepatan).
- Teks tahap: AI bila dikonfigurasi, selain itu templat. Klaim budaya dari meta.json (kurasi)
  ikut disimpan; klaim "fakta" wajib punya sumber yang terdaftar di meta.json.
- Tanpa --publish, karya dan lesson berstatus draft (belum tampil di galeri) sampai ditinjau.
"""

import argparse
import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai.lesson_text import PROMPT_VERSION, write_lesson_text  # noqa: E402
from color.palettes import region_colors_for  # noqa: E402
from core.config import get_settings  # noqa: E402
from core.supabase_client import get_supabase  # noqa: E402
from cv import pipeline  # noqa: E402
from cv.stage_planner import plan_stages  # noqa: E402
from services.lessons import build_payload, save_lesson, upload_layers  # noqa: E402

REQUIRED = ["slug", "title", "license", "image", "sources"]


def thumbnail(image_bytes: bytes, max_side: int = 480) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85, optimize=True)
        return buf.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    parser.add_argument("--publish", action="store_true", help="terbitkan (hanya setelah ditinjau)")
    args = parser.parse_args()

    meta = json.loads((args.folder / "meta.json").read_text(encoding="utf-8"))
    missing = [k for k in REQUIRED if not meta.get(k)]
    if missing:
        sys.exit(f"meta.json kurang: {missing}")
    if args.publish and meta["license"] == "unknown":
        sys.exit("Tidak bisa terbit: lisensi belum jelas.")

    settings = get_settings()
    db = get_supabase()
    image = (args.folder / meta["image"]).read_bytes()
    slug = meta["slug"]

    # 1. Sumber
    for s in meta["sources"]:
        db.table("sources").upsert(
            {k: s.get(k) for k in ("code", "title", "publisher", "url", "note", "license") if s.get(k) is not None},
            on_conflict="code",
        ).execute()
    source_codes = {s["code"] for s in meta["sources"]}

    # 2. Gambar karya + thumbnail
    catalog = db.storage.from_("catalog")
    image_path, thumb_path = f"artworks/{slug}/image.jpg", f"artworks/{slug}/thumb.jpg"
    catalog.upload(image_path, image, {"content-type": "image/jpeg", "upsert": "true"})
    catalog.upload(thumb_path, thumbnail(image), {"content-type": "image/jpeg", "upsert": "true"})

    # 3. Karya
    status = "published" if args.publish else "draft"
    artwork = db.table("artworks").upsert(
        {
            "slug": slug,
            "title": meta["title"],
            "artist": meta.get("artist"),
            "artist_death_year": meta.get("artist_death_year"),
            "tradition": meta.get("tradition"),
            "region_origin": meta.get("region_origin"),
            "image_path": image_path,
            "thumbnail_path": thumb_path,
            "license": meta["license"],
            "license_note": meta.get("license_note"),
            "rights_evidence_url": meta.get("rights_evidence_url"),
            "adaptation_scope": meta.get("adaptation_scope"),
            "status": status,
        },
        on_conflict="slug",
    ).execute().data[0]
    links = [{"artwork_id": artwork["id"], "source_id": row["id"], "claim_note": next((s.get("claim_note") for s in meta["sources"] if s["code"] == row["code"]), None)}
             for row in db.table("sources").select("id, code").in_("code", list(source_codes)).execute().data]
    db.table("artwork_sources").upsert(links, on_conflict="artwork_id,source_id").execute()

    # 4. Pipeline CV + tahapan + teks
    cv = pipeline.run(
        image,
        scope=meta.get("scope"),
        canvas_size=meta.get("canvas_size", "A4"),
        lineart_method=settings.lineart_method_collection,
        mask_model=settings.mask_model,
        use_shading=meta.get("use_shading"),
    )
    stages = plan_stages(cv.regions, use_shading=cv.use_shading, checkpoint_count=settings.checkpoint_count,
                         has_main_object_layer=cv.main_object_svg is not None)
    text, source, notes = write_lesson_text(cv, stages, use_ai=True, safety_id="rs_collection", job_id=None)
    if meta.get("skill_goal"):
        text.skill_goal = meta["skill_goal"]
    if meta.get("culture_goal"):
        text.culture_goal = meta["culture_goal"]

    curated = []
    for c in meta.get("claims", []):
        if c["type"] == "fakta" and not set(c.get("source_codes", [])) & source_codes:
            sys.exit(f"Klaim fakta tanpa sumber terdaftar: {c['text'][:60]}")
        curated.append({"text": c["text"], "type": c["type"], "source_codes": c.get("source_codes", []), "stage_code": None})

    # 5. Versi baru lesson
    last = db.table("lesson_versions").select("version").eq("artwork_id", artwork["id"]).order("version", desc=True).limit(1).execute().data
    version = (last[0]["version"] + 1) if last else 1
    layers = upload_layers(cv, "catalog", f"artworks/{slug}/v{version}")
    payload = build_payload(
        cv, stages, text, source, layers,
        lesson={
            "artwork_id": artwork["id"],
            "origin": "collection",
            "version": version,
            "scope": meta.get("scope"),
            "checkpoint_count": settings.checkpoint_count,
            "prompt_version": PROMPT_VERSION if source == "ai" else None,
            "status": status,
            "reviewer": meta.get("reviewer"),
        },
        session_id=None,
        extra_claims=curated,
        region_colors=region_colors_for(cv.regions),
    )
    lesson_id = save_lesson(payload, layers)
    print(json.dumps({
        "artwork": slug, "status": status, "lesson_version_id": lesson_id, "version": version,
        "text_source": source, "notes": notes, "regions": len(cv.regions), "stages": len(stages),
        "use_shading": cv.use_shading, "warnings": cv.warnings, "timings_ms": cv.timings_ms,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
