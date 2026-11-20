"""Klien Supabase dengan service role. Hanya dipakai di backend, tidak pernah dikirim ke frontend."""

from functools import lru_cache

from supabase import Client, create_client

from core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_configured:
        raise RuntimeError("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diisi di .env")
    return create_client(settings.supabase_url, settings.supabase_service_role_key.get_secret_value())
