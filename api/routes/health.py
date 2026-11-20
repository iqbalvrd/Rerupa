"""Endpoint kesehatan: memastikan API hidup dan koneksi ke layanan luar."""

from fastapi import APIRouter

from core.config import get_settings
from core.supabase_client import get_supabase

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    result: dict = {"status": "ok", "supabase": "not_configured", "openai": "not_configured"}

    if settings.supabase_configured:
        try:
            # Memanggil Storage API: membuktikan URL + service role key valid tanpa butuh tabel apa pun.
            get_supabase().storage.list_buckets()
            result["supabase"] = "ok"
        except Exception as exc:  # noqa: BLE001 - laporkan jenis error saja, tanpa detail rahasia
            result["supabase"] = f"error: {type(exc).__name__}"
            result["status"] = "degraded"

    if settings.openai_configured:
        result["openai"] = "configured"

    return result
