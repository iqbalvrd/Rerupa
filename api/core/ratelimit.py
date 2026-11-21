"""Rate limit per IP dan per sesi (SYSTEM_ARCHITECTURE §11, SOLUSI_RISIKO §5).

Jendela tetap di memori proses API: cukup untuk satu instance (Railway, versi awal). Bila API
diskalakan ke beberapa instance, pindahkan penghitung ke Redis/Postgres. Kuota bisnis (3 tutorial,
feedback per tahap) tetap di database dan tidak bergantung pada modul ini.

Tidak menyimpan IP atau token mentah: kunci di-hash dan hanya hidup selama jendela berjalan.
"""

import hashlib
import threading
import time
from dataclasses import dataclass

from fastapi import Request

from core.config import Settings


@dataclass(frozen=True)
class Rule:
    name: str
    limit: int
    window: int  # detik


class FixedWindowLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: dict[tuple[str, str, int], int] = {}
        self._last_sweep = 0.0

    def hit(self, rule: Rule, key: str, now: float | None = None) -> int | None:
        """Catat satu permintaan. Return None bila boleh, atau detik tunggu (Retry-After) bila melebihi."""
        if rule.limit <= 0:
            return None
        now = time.time() if now is None else now
        bucket = int(now // rule.window)
        k = (rule.name, key, bucket)
        with self._lock:
            self._sweep(now)
            n = self._counts.get(k, 0) + 1
            self._counts[k] = n
        if n > rule.limit:
            return max(1, int((bucket + 1) * rule.window - now))
        return None

    def _sweep(self, now: float) -> None:
        if now - self._last_sweep < 60:
            return
        self._last_sweep = now
        self._counts = {k: v for k, v in self._counts.items() if (k[2] + 1) * _WINDOWS.get(k[0], 3600) > now}

    def reset(self) -> None:
        with self._lock:
            self._counts.clear()


_WINDOWS: dict[str, int] = {}
limiter = FixedWindowLimiter()


def _h(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def client_ip(request: Request, trust_proxy: bool) -> str:
    if trust_proxy:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            # Entri paling kanan ditambahkan oleh proxy kita; yang kiri bisa dipalsukan klien.
            return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def rules_for(settings: Settings) -> dict[str, Rule]:
    rules = {
        "ip": Rule("ip", settings.rate_limit_per_ip_minute, 60),
        "session": Rule("session", settings.rate_limit_per_session_minute, 60),
        "create_session": Rule("create_session", settings.rate_limit_sessions_per_ip_hour, 3600),
        "upload": Rule("upload", settings.rate_limit_uploads_per_ip_hour, 3600),
    }
    for r in rules.values():
        _WINDOWS[r.name] = r.window
    return rules


def is_upload(method: str, path: str) -> bool:
    return method == "POST" and (path == "/lessons/generate" or (path.startswith("/sessions/") and path.endswith("/checkpoints")))


def check(request: Request, settings: Settings) -> int | None:
    """Return detik tunggu bila permintaan harus ditolak (429), atau None."""
    path = request.url.path
    if request.method == "OPTIONS" or path == "/health":
        return None
    rules = rules_for(settings)
    ip = _h(client_ip(request, settings.trust_proxy_headers))
    checks = [(rules["ip"], ip)]
    if request.method == "POST" and path == "/sessions":
        checks.append((rules["create_session"], ip))
    if is_upload(request.method, path):
        checks.append((rules["upload"], ip))
    token = request.cookies.get(settings.session_cookie_name)
    if token and len(token) <= 128:
        checks.append((rules["session"], _h(token)))
    wait = None
    for rule, key in checks:
        w = limiter.hit(rule, key)
        if w is not None:
            wait = max(wait or 0, w)
    return wait
