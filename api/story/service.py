"""Merakit storyline: tentukan dasar kisah → storyboard → panel (disimpan satu per satu).

Dasar kisah (RENCANA §4.8, PRD FR16):
- Materi koleksi → `curated` (klaim kurasi + sumbernya).
- Foto unggahan → agen riset (story/sources.research), TANPA bertanya ke pengguna:
  - interpretation_only → `ai_interpretation` tanpa pencarian.
  - Kenali karya dari foto (bila diizinkan) atau isian → cari sumber web (teks saja) → keyakinan.
  - Keyakinan high/medium + ada fakta bersumber → `sourced`.
  - Isian pengguna tanpa fakta → `user_hint`.
  - Kandidat dari foto tanpa fakta, keyakinan medium → `ai_interpretation` dengan kandidat sebagai dugaan.
  - Keyakinan low / tidak ada kandidat → `ai_interpretation` tanpa nama karya (tidak menebak).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass

from ai import openai_client as oc
from core.config import get_settings
from core.supabase_client import get_supabase
from services.storage import with_retry
from story import panels as panel_mod
from story import sources
from story.storyboard import write_storyboard

log = logging.getLogger("rerupa.story")

BASIS_LABEL = {
    "curated": "Kisah bersumber",
    "sourced": "Kisah bersumber",
    "user_hint": "Berdasarkan info dari kamu",
    "ai_interpretation": "Interpretasi AI",
}


@dataclass
class StoryOutcome:
    story_id: str | None = None


def _download(bucket: str, path: str) -> bytes:
    return with_retry(lambda: get_supabase().storage.from_(bucket).download(path), "download")


def load_lesson(lesson_id: str) -> dict:
    db = get_supabase()
    lesson = db.table("lesson_versions").select("id, origin, artwork_id, version, owner_session_id, image_width, image_height, artworks(slug, title, artist, tradition, region_origin)").eq("id", lesson_id).limit(1).execute().data[0]
    lesson["regions"] = db.table("regions").select("code, label, hex, area_pct, bbox, is_main_object").eq("lesson_version_id", lesson_id).order("code").execute().data
    layer = db.table("visual_layers").select("bucket, asset_path, purged_at").eq("lesson_version_id", lesson_id).eq("kind", "original_photo").limit(1).execute().data
    lesson["original_jpeg"] = _download(layer[0]["bucket"], layer[0]["asset_path"]) if layer and not layer[0]["purged_at"] else None
    return lesson


def curated_claims(lesson_id: str) -> tuple[list[dict], list[dict]]:
    rows = get_supabase().table("culture_claims").select("text, type, culture_claim_sources(sources(code, title, url))").eq("lesson_version_id", lesson_id).order("order_no").execute().data
    claims, srcs = [], {}
    for r in rows:
        links = [l["sources"] for l in r.get("culture_claim_sources") or [] if l.get("sources")]
        claims.append({"text": r["text"], "type": r["type"], "source_urls": [l["url"] for l in links if l.get("url")], "source_codes": [l["code"] for l in links]})
        for l in links:
            if l.get("url"):
                srcs[l["url"]] = {"url": l["url"], "title": l["title"], "domain": sources.domain(l["url"])}
    return claims, list(srcs.values())


def decide_basis(lesson: dict, params: dict, *, safety_id: str, job_id: str | None) -> tuple[str, dict, list[dict], list[dict]]:
    """Return (basis, identity, claims, sources). identity.confidence = hasil agen riset (foto unggahan)."""
    settings = get_settings()
    if lesson["origin"] == "collection":
        a = lesson.get("artworks") or {}
        identity = {"title": a.get("title"), "artist": a.get("artist"), "origin": a.get("tradition") or a.get("region_origin"), "confirmed_by_user": None,
                    "source": "curated", "confidence": "high"}  # identitas koleksi sudah dikurasi: bukan dugaan
        claims, srcs = curated_claims(lesson["id"])
        return "curated", identity, claims, srcs

    if params.get("interpretation_only"):
        return "ai_interpretation", {"confirmed_by_user": False}, [], []

    hints = {k: (params.get(f"{k}_hint") or "").strip() for k in ("title", "artist", "origin")}
    hints = {k: v for k, v in hints.items() if v}
    photo = lesson["original_jpeg"] if params.get("consent_ai_photo") else None
    if not hints and photo is None:
        return "ai_interpretation", {"confirmed_by_user": False}, [], []  # tidak ada yang bisa diriset

    r = sources.research(photo, hints, safety_id=safety_id, job_id=job_id, max_searches=settings.story_max_web_searches)
    identity, claims, srcs, conf = r["identity"], r["claims"], r["sources"], r["confidence"]
    has_fact = any(c["type"] == "fakta" for c in claims)
    if has_fact and conf in ("high", "medium"):
        return "sourced", identity, claims, srcs
    if hints:
        return "user_hint", identity, claims, srcs
    if identity and conf == "medium":
        # Kandidat kuat secara visual tetapi belum ada sumber: dipakai sebagai dugaan, klaim web tidak dipakai.
        return "ai_interpretation", identity, [c for c in claims if c["type"] == "perkiraan"], []
    return "ai_interpretation", {"confirmed_by_user": False, "confidence": "low"}, [], []


def build_story(lesson_id: str, session_id: str | None, params: dict, *, safety_id: str, job_id: str | None, final: bool = False, progress: Callable[[str], None] = lambda s: None) -> StoryOutcome:
    settings = get_settings()
    db = get_supabase()
    lesson = load_lesson(lesson_id)

    progress("sources")
    basis, identity, claims, srcs = decide_basis(lesson, params, safety_id=safety_id, job_id=job_id)

    progress("storyboard")
    # Foto karya ikut ke AI untuk materi koleksi (gambar publik) atau bila pengguna sudah setuju.
    can_see = lesson["origin"] == "collection" or bool(params.get("consent_ai_photo"))
    sb = write_storyboard(basis=basis, identity=identity, claims=claims, regions=lesson["regions"], image_jpeg=lesson["original_jpeg"] if can_see else None, safety_id=safety_id, job_id=job_id)

    image_model = settings.openai_image_model_final if final else settings.openai_image_model_draft
    # Cerita lama untuk pasangan (lesson, sesi) yang sama diganti (hanya terjadi bila sebelumnya gagal).
    q = db.table("stories").delete().eq("lesson_version_id", lesson_id)
    (q.is_("session_id", "null") if session_id is None else q.eq("session_id", session_id)).execute()
    story = db.table("stories").insert({
        "lesson_version_id": lesson_id, "session_id": session_id, "job_id": job_id, "story_basis": basis,
        "status": "generating", "title": sb.title[:120], "summary": sb.summary[:400], "identity": identity,
        "hints": {k: params.get(f"{k}_hint") for k in ("title", "artist", "origin") if params.get(f"{k}_hint")},
        "claims": claims, "sources": srcs, "characters": [c.model_dump() for c in sb.characters],
        "style_guide": sb.style_guide[:400], "text_model": oc.model_for("storyboard", settings), "image_model": image_model,
    }).execute().data[0]
    db.table("story_panels").insert([
        {"story_id": story["id"], "order_no": p.order_no, "narration": p.narration, "scene": p.scene, "kind": "artwork_crop" if p.use_artwork_crop else "generated",
         "status": "pending", "character_codes": p.character_codes, "focus_region_codes": p.focus_region_codes}
        for p in sb.panels
    ]).execute()

    if lesson["origin"] == "collection":
        bucket, prefix = "catalog", f"artworks/{(lesson.get('artworks') or {}).get('slug', lesson_id)}/story/v{lesson['version']}"
    else:
        bucket, prefix = "derived", f"{session_id}/{lesson_id}/story"
    region_bbox = {r["code"]: r["bbox"] for r in lesson["regions"]}
    previous_png = None
    crop_repeats: dict = {}
    images = 0
    for p in sb.panels:
        progress(f"panel_{p.order_no}")
        if not lesson["original_jpeg"]:
            res = panel_mod.PanelResult(p.order_no, "text", "text_only", check={"error": "original_missing"})
        else:
            res = panel_mod.make_panel(sb, p, original_jpeg=lesson["original_jpeg"], region_bbox=region_bbox, previous_png=previous_png, crop_repeats=crop_repeats,
                                       image_model=image_model, quality="high" if final else "medium", safety_id=safety_id, job_id=job_id)
        row = {"kind": res.kind, "status": res.status, "check_result": res.check}
        if res.jpeg:
            path = f"{prefix}/panel_{p.order_no}.jpg"
            storage = db.storage.from_(bucket)
            with_retry(lambda path=path, data=res.jpeg: storage.upload(path, data, {"content-type": "image/jpeg", "upsert": "true"}), "upload_panel")
            row.update({"bucket": bucket, "asset_path": path})
            images += 1
            if res.kind == "generated":
                previous_png = panel_mod.to_png(res.jpeg, 768)
        db.table("story_panels").update(row).eq("story_id", story["id"]).eq("order_no", p.order_no).execute()

    db.table("stories").update({"status": "ready" if images else "text_only"}).eq("id", story["id"]).execute()
    return StoryOutcome(story_id=story["id"])
