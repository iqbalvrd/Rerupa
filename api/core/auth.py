"""Akun pengguna (Supabase Auth) dan peran admin.

Frontend mendaftar/masuk langsung ke Supabase Auth (email + password) dan mengirim access token di
header `Authorization: Bearer …`. Token tidak lewat cookie, jadi tetap jalan di Safari iOS yang
memblokir cookie lintas situs.

Backend memverifikasi token ke Supabase Auth (bukan sekadar membaca klaimnya) lalu membaca peran
dari tabel `profiles`. Klaim peran dari klien tidak pernah dipercaya. Admin awal ditentukan
variabel `ADMIN_EMAILS` (hanya email yang sudah terverifikasi) dan dicatat ke `profiles.role`.
"""

import logging
import threading
import time
from dataclasses import dataclass

from fastapi import Depends, Request

from core.config import get_settings
from core.errors import AppError
from core.security import hash_token
from core.supabase_client import get_supabase

log = logging.getLogger("rerupa.auth")

# Verifikasi token disimpan sebentar agar polling tidak memanggil Supabase Auth tiap request.
# Pendek supaya akun yang dihapus/diturunkan perannya cepat berlaku.
_CACHE_TTL = 30.0
_CACHE_MAX = 2048
_cache: dict[str, tuple[float, "CurrentUser"]] = {}
_lock = threading.Lock()


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    role: str  # 'user' | 'admin'

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 4096:
        return None
    return token.strip()


def clear_auth_cache() -> None:
    with _lock:
        _cache.clear()


def _verify(token: str) -> "CurrentUser | None":
    key = hash_token(token)
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    try:
        res = get_supabase().auth.get_user(token)
    except Exception:
        # Token kedaluwarsa/palsu/dicabut → AuthApiError. Gangguan jaringan juga berarti "tidak terverifikasi".
        return None
    auth_user = res.user if res else None
    if auth_user is None:
        return None
    user = _with_role(str(auth_user.id), auth_user.email or "", bool(getattr(auth_user, "email_confirmed_at", None)))
    with _lock:
        if len(_cache) >= _CACHE_MAX:
            _cache.clear()
        _cache[key] = (now + _CACHE_TTL, user)
    return user


def admin_emails() -> set[str]:
    return {e.strip().lower() for e in get_settings().admin_emails.split(",") if e.strip()}


def _with_role(user_id: str, email: str, email_confirmed: bool) -> CurrentUser:
    db = get_supabase()
    rows = db.table("profiles").select("role").eq("id", user_id).limit(1).execute().data
    if not rows:
        # Trigger pendaftaran seharusnya sudah membuatnya; jaga-jaga untuk akun lama.
        rows = db.table("profiles").upsert({"id": user_id, "email": email}, on_conflict="id").execute().data
    role = rows[0]["role"] if rows else "user"
    if role != "admin" and email_confirmed and email.lower() in admin_emails():
        db.table("profiles").update({"role": "admin"}).eq("id", user_id).execute()
        log.info("admin_bootstrap", extra={"user_id": user_id})
        role = "admin"
    return CurrentUser(id=user_id, email=email, role=role)


def optional_user(request: Request) -> CurrentUser | None:
    token = bearer_token(request)
    return _verify(token) if token else None


def current_user(request: Request) -> CurrentUser:
    """Pengguna yang masuk. Tanpa token valid → 401 login_required."""
    user = optional_user(request)
    if user is None:
        raise AppError("login_required", 401)
    return user


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if not user.is_admin:
        raise AppError("admin_required", 403)
    return user


def claim_session(session: dict, user: CurrentUser) -> None:
    """Sesi latihan harus milik akun ini. Sesi tamu lama (tanpa pemilik) ditautkan ke akun saat dipakai;
    sesi milik akun lain dianggap tidak ada (404, tidak membocorkan)."""
    owner = session.get("user_id")
    if owner is None:
        claimed = get_supabase().table("practice_sessions").update({"user_id": user.id}).eq("id", session["id"]).is_("user_id", "null").execute().data
        if not claimed:  # akun lain menautkannya lebih dulu
            raise AppError("not_found", 404)
        session["user_id"] = user.id
    elif str(owner) != user.id:
        raise AppError("not_found", 404)
