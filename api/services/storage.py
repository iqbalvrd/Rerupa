"""Akses Storage: signed URL untuk bucket privat dan operasi file dengan retry.

Frontend tidak pernah memegang kunci Storage.
"""

import logging
import time
from collections.abc import Callable
from typing import TypeVar

from core.supabase_client import get_supabase

log = logging.getLogger("rerupa.storage")
T = TypeVar("T")


def with_retry(op: Callable[[], T], what: str, attempts: int = 3, already_done: Callable[[Exception], bool] | None = None) -> T | None:
    """Ulangi operasi Storage saat gangguan jaringan sesaat (jeda 0,5 s lalu 1 s).

    already_done(exc) → True bila error berarti operasi sebenarnya sudah berhasil
    (mis. upload pertama sampai tetapi responsnya hilang, lalu percobaan ulang ditolak 'Duplicate').
    """
    for attempt in range(1, attempts + 1):
        try:
            return op()
        except Exception as exc:
            if already_done and already_done(exc):
                return None
            if attempt == attempts:
                raise
            log.warning("storage_retry", extra={"op": what, "attempt": attempt, "error": type(exc).__name__})
            time.sleep(0.5 * attempt)
    return None


def remove_prefix(bucket: str, prefix: str) -> int:
    """Hapus semua file di bawah folder prefix (rekursif). Return jumlah file yang dihapus."""
    storage = get_supabase().storage.from_(bucket)
    files: list[str] = []
    stack = [prefix.strip("/")]
    while stack:
        folder = stack.pop()
        for item in with_retry(lambda f=folder: storage.list(f, {"limit": 1000}), "list") or []:
            path = f"{folder}/{item['name']}"
            if item.get("id") is None:  # folder
                stack.append(path)
            else:
                files.append(path)
    for i in range(0, len(files), 100):
        chunk = files[i : i + 100]
        with_retry(lambda c=chunk: storage.remove(c), "remove_prefix")
    return len(files)


def is_duplicate(exc: Exception) -> bool:
    text = str(exc).lower()
    return "duplicate" in text or "already exists" in text or "409" in text

CATALOG_URL_TTL = 3600  # aset terbit: 1 jam
PRIVATE_URL_TTL = 1800  # lapisan tutorial milik sesi: 30 menit (frontend memuat ulang GET /lessons bila kedaluwarsa)


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
