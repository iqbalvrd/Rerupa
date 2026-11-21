"""Retensi file & sesi (PRD §17, ERD §6). Dijalankan worker tiap 15 menit (bagian DB-saja oleh pg_cron).

1. Foto unggahan (mentah + diluruskan) > 24 jam → file dihapus, baris ditandai purged.
2. Lapisan tutorial mode bebas yang diturunkan dari foto > 24 jam → file dihapus, lapisan ditandai
   purged (UI menampilkan penanda; teks tahap, resep, dan feedback tetap ada sampai sesi berakhir).
   Grid tidak berasal dari foto, jadi tetap.
3. Sesi terhapus atau kedaluwarsa (7 hari) → semua file sesi dihapus, LALU baris sesi dihapus
   (CASCADE ke progres, unggahan, job, feedback, tutorial mode bebas).

Idempoten dan aman dijalankan beberapa worker sekaligus (hapus file yang sudah tidak ada = no-op).
"""

import logging
from datetime import timedelta

from core.session import now_utc
from core.supabase_client import get_supabase
from services.storage import with_retry
from services.uploads import BUCKET, purge_session_files

log = logging.getLogger("rerupa.retention")

BATCH = 100
PHOTO_DERIVED_KINDS_KEEP = {"grid"}
SESSION_MAX_DAYS = 8  # batas pencarian unggahan lama (sesi hidup ≤7 hari)


def _remove(bucket: str, paths: list[str]) -> None:
    if paths:
        with_retry(lambda: get_supabase().storage.from_(bucket).remove(paths), "retention_remove")


def purge_expired_uploads(limit: int = BATCH) -> int:
    db = get_supabase()
    rows = (
        db.table("uploads")
        .select("id, raw_path, normalized_path, rectified_path")
        .is_("purged_at", "null")
        .lt("expires_at", now_utc().isoformat())
        .limit(limit)
        .execute()
        .data
    )
    if not rows:
        return 0
    _remove(BUCKET, [p for r in rows for p in (r["raw_path"], r["normalized_path"], r["rectified_path"]) if p])
    db.table("uploads").update({"raw_path": None, "normalized_path": None, "rectified_path": None, "purged_at": now_utc().isoformat()}).in_("id", [r["id"] for r in rows]).execute()
    return len(rows)


def purge_expired_lesson_layers(limit: int = BATCH) -> int:
    db = get_supabase()
    now = now_utc()
    expired = (
        db.table("uploads")
        .select("id")
        .eq("purpose", "reference")
        .lt("expires_at", now.isoformat())
        .gt("created_at", (now - timedelta(days=SESSION_MAX_DAYS)).isoformat())
        .execute()
        .data
    )
    if not expired:
        return 0
    layers = (
        db.table("visual_layers")
        .select("id, kind, bucket, asset_path, lesson_versions!inner(origin, source_upload_id)")
        .is_("purged_at", "null")
        .eq("bucket", "derived")
        .eq("lesson_versions.origin", "free_mode")
        .in_("lesson_versions.source_upload_id", [u["id"] for u in expired])
        .limit(limit)
        .execute()
        .data
    )
    layers = [l for l in layers if l["kind"] not in PHOTO_DERIVED_KINDS_KEEP]
    if not layers:
        return 0
    _remove("derived", [l["asset_path"] for l in layers])
    db.table("visual_layers").update({"purged_at": now.isoformat()}).in_("id", [l["id"] for l in layers]).execute()
    return len(layers)


def cleanup_sessions(limit: int = 50) -> int:
    db = get_supabase()
    now = now_utc().isoformat()
    rows = db.table("practice_sessions").select("id").or_(f"deleted_at.not.is.null,expires_at.lt.{now}").limit(limit).execute().data
    done = 0
    for r in rows:
        try:
            purge_session_files(r["id"])
            db.table("practice_sessions").delete().eq("id", r["id"]).execute()
            done += 1
        except Exception:
            # File gagal dihapus → baris dibiarkan (path tetap tercatat) dan dicoba lagi di putaran berikutnya.
            log.exception("retention_session_failed", extra={"session_id": r["id"]})
    return done


def run() -> dict[str, int]:
    out = {"uploads": purge_expired_uploads(), "lesson_layers": purge_expired_lesson_layers(), "sessions": cleanup_sessions()}
    if any(out.values()):
        log.info("retention_done", extra=out)
    return out
