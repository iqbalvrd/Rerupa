"""Signed URL untuk bucket privat. Frontend tidak pernah memegang kunci Storage."""

from core.supabase_client import get_supabase

CATALOG_URL_TTL = 3600  # aset terbit: 1 jam
PRIVATE_URL_TTL = 300  # foto/turunan milik sesi: 5 menit


def signed_urls(bucket: str, paths: list[str], ttl: int) -> dict[str, str]:
    """path → URL bertanda tangan. Path yang gagal dibuatkan URL tidak dimasukkan."""
    paths = [p for p in paths if p]
    if not paths:
        return {}
    items = get_supabase().storage.from_(bucket).create_signed_urls(paths, ttl)
    out: dict[str, str] = {}
    for item in items:
        url = item.get("signedURL") or item.get("signedUrl")
        if url and not item.get("error"):
            out[item["path"]] = url
    return out
