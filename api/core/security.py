"""Token sesi dan hash. Token mentah hanya ada di cookie pengguna; DB menyimpan SHA-256-nya."""

import hashlib
import hmac
import secrets


def new_session_token() -> str:
    """Token acak 256-bit, aman untuk URL/cookie."""
    return secrets.token_urlsafe(32)


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def hash_token(token: str) -> str:
    return sha256_hex(token)


def safety_id_for(session_id: str) -> str:
    """ID stabil untuk safety_identifier OpenAI; bukan data pribadi dan tidak bisa dibalik ke token."""
    return "rs_" + sha256_hex("rerupa-safety:" + session_id)[:32]


def payload_hash(*parts: str) -> str:
    """Hash isi permintaan untuk idempotensi (kunci sama + isi beda → konflik)."""
    return sha256_hex("|".join(parts))


def constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
