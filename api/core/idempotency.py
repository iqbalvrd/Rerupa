"""Header Idempotency-Key untuk endpoint yang membuat job."""

import re

from fastapi import Header

from core.errors import AppError

_KEY_RE = re.compile(r"^[A-Za-z0-9_\-:.]{8,128}$")


def idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    """Wajib ada, 8–128 karakter aman. Frontend cukup membuat UUID baru per aksi pengguna."""
    if idempotency_key is None:
        raise AppError("idempotency_key_required", 400)
    if not _KEY_RE.match(idempotency_key):
        raise AppError("validation_error", 422)
    return idempotency_key
