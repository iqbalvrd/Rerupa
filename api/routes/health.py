"""Endpoint kesehatan: memastikan API hidup dan koneksi ke layanan luar."""

from fastapi import APIRouter

from core.config import get_settings
from core.supabase_client import get_supabase

router = APIRouter(tags=["health"])

QUEUE_DEGRADED_SECONDS = 30


def _queue_stats() -> dict:
    """Jumlah job antre + umur job antre tertua (tanpa data sesi). Untuk memantau worker saat uji pengguna."""
    from datetime import datetime

    from core.session import now_utc

    rows = get_supabase().table("jobs").select("created_at", count="exact").eq("status", "queued").order("created_at").limit(1).execute()
    oldest = 0
    if rows.data:
        oldest = int((now_utc() - datetime.fromisoformat(rows.data[0]["created_at"])).total_seconds())
    return {"queued": rows.count or 0, "oldest_queued_seconds": oldest}


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    result: dict = {"status": "ok", "supabase": "not_configured", "openai": "not_configured"}

    if settings.supabase_configured:
        try:
            # Memanggil Storage API: membuktikan URL + service role key valid tanpa butuh tabel apa pun.
            get_supabase().storage.list_buckets()
            result["supabase"] = "ok"
            result["queue"] = _queue_stats()
            if result["queue"]["oldest_queued_seconds"] > QUEUE_DEGRADED_SECONDS:
                result["status"] = "degraded"  # kemungkinan worker mati / kewalahan
        except Exception as exc:  # noqa: BLE001 - laporkan jenis error saja, tanpa detail rahasia
            result["supabase"] = f"error: {type(exc).__name__}"
            result["status"] = "degraded"

    if settings.openai_configured:
        result["openai"] = "configured"
    result["environment"] = settings.environment

    return result
