"""Klien Supabase dengan service role. Hanya dipakai di backend, tidak pernah dikirim ke frontend.

Memakai pool koneksi HTTP/1.1, bukan HTTP/2 bawaan. Dengan HTTP/2, semua thread (endpoint API,
query paralel, jalur worker) menumpang di SATU koneksi; saat server menutupnya (ConnectionTerminated),
setiap permintaan yang sedang berjalan ikut gagal → `internal_error` saat beberapa pengguna mengunggah
bersamaan (ditemukan lewat uji 4 pengguna serentak, ANALISA_OPTIMASI.md). Pool HTTP/1.1 aman untuk
banyak thread dan satu koneksi yang putus hanya memengaruhi satu permintaan.
"""

from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_configured:
        raise RuntimeError("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diisi di .env")
    http = httpx.Client(
        http2=False,
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(max_connections=64, max_keepalive_connections=32, keepalive_expiry=30.0),
    )
    options = ClientOptions(httpx_client=http, auto_refresh_token=False, persist_session=False)
    return create_client(settings.supabase_url, settings.supabase_service_role_key.get_secret_value(), options=options)
