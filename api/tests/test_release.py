"""Tes Fase 6 (rilis): rate limit, IP di belakang proxy, header keamanan, konfigurasi produksi, batas tunggu job."""

from types import SimpleNamespace

import pytest

from conftest import integration
from core import ratelimit
from core.config import Settings


def req(path="/artworks", method="GET", ip="1.2.3.4", headers=None, cookie=None):
    h = {k.lower(): v for k, v in (headers or {}).items()}
    return SimpleNamespace(
        url=SimpleNamespace(path=path),
        method=method,
        headers=h,
        cookies={"rerupa_session": cookie} if cookie else {},
        client=SimpleNamespace(host=ip),
    )


def settings(**kw):
    base = dict(rate_limit_per_ip_minute=5, rate_limit_per_session_minute=8, rate_limit_sessions_per_ip_hour=2, rate_limit_uploads_per_ip_hour=3, _env_file=None)
    return Settings(**{**base, **kw})


@pytest.fixture(autouse=True)
def fresh_limiter():
    ratelimit.limiter.reset()
    yield
    ratelimit.limiter.reset()


def test_per_ip_limit_then_retry_after():
    s = settings()
    assert all(ratelimit.check(req(), s) is None for _ in range(5))
    wait = ratelimit.check(req(), s)
    assert wait is not None and 1 <= wait <= 60
    assert ratelimit.check(req(ip="5.6.7.8"), s) is None  # IP lain tidak terdampak


def test_session_creation_and_upload_limits_are_stricter():
    s = settings(rate_limit_per_ip_minute=100)
    assert ratelimit.check(req("/sessions", "POST"), s) is None
    assert ratelimit.check(req("/sessions", "POST"), s) is None
    assert ratelimit.check(req("/sessions", "POST"), s) is not None
    for _ in range(3):
        assert ratelimit.check(req("/lessons/generate", "POST"), s) is None
    assert ratelimit.check(req("/sessions/abc/checkpoints", "POST"), s) is not None  # generate + checkpoint berbagi kuota
    assert ratelimit.check(req("/sessions/abc/checkpoints", "GET"), s) is None  # membaca hasil tidak dihitung upload


def test_per_session_limit_across_ips():
    s = settings(rate_limit_per_ip_minute=100)
    for i in range(8):
        assert ratelimit.check(req("/jobs/x", ip=f"10.0.0.{i}", cookie="tok"), s) is None
    assert ratelimit.check(req("/jobs/x", ip="10.0.0.99", cookie="tok"), s) is not None


def test_health_and_preflight_not_limited():
    s = settings(rate_limit_per_ip_minute=1)
    for _ in range(5):
        assert ratelimit.check(req("/health"), s) is None
        assert ratelimit.check(req(method="OPTIONS"), s) is None


def test_zero_disables_limit():
    s = settings(rate_limit_per_ip_minute=0)
    assert all(ratelimit.check(req(), s) is None for _ in range(50))


def test_client_ip_behind_proxy():
    r = req(ip="10.0.0.1", headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.9"})
    assert ratelimit.client_ip(r, trust_proxy=False) == "10.0.0.1"  # tanpa proxy: header diabaikan (bisa dipalsukan)
    assert ratelimit.client_ip(r, trust_proxy=True) == "203.0.113.9"  # entri paling kanan = dari proxy
    r = req(ip="10.0.0.1", headers={"X-Real-IP": "198.51.100.7", "X-Forwarded-For": "6.6.6.6"})
    assert ratelimit.client_ip(r, trust_proxy=True) == "198.51.100.7"


def test_window_resets():
    rule = ratelimit.Rule("t", 2, 60)
    lim = ratelimit.FixedWindowLimiter()
    assert lim.hit(rule, "k", now=120.0) is None and lim.hit(rule, "k", now=121.0) is None
    assert lim.hit(rule, "k", now=150.0) == 30
    assert lim.hit(rule, "k", now=180.0) is None  # jendela baru


def test_production_config_checks():
    bad = Settings(environment="production", _env_file=None, supabase_url="", cookie_secure=False, frontend_origin="http://localhost:3000")
    problems = " ".join(bad.production_problems())
    assert "SUPABASE" in problems and "COOKIE_SECURE" in problems and "TRUST_PROXY_HEADERS" in problems
    good = Settings(
        environment="production", _env_file=None, supabase_url="https://x.supabase.co", supabase_service_role_key="k",
        cookie_secure=True, cookie_samesite="none", trust_proxy_headers=True, frontend_origin="https://rerupa.vercel.app",
    )
    assert good.production_problems() == []
    priced = Settings(**{**good.model_dump(), "openai_api_key": "sk-x", "openai_price_input_per_m": 0, "_env_file": None})
    assert any("OPENAI_PRICE" in p for p in priced.production_problems())
    assert Settings(_env_file=None, frontend_origin="https://a.app, https://b.app/").frontend_origins == ["https://a.app", "https://b.app"]


def test_security_headers_and_rate_limited_response(monkeypatch):
    from fastapi.testclient import TestClient

    import main

    c = TestClient(main.app)
    r = c.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["referrer-policy"] == "no-referrer"
    monkeypatch.setattr(main, "settings", settings(rate_limit_per_ip_minute=1))
    c.get("/artworks")
    r = c.get("/artworks")
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited" and int(r.headers["retry-after"]) >= 1


@integration
def test_overdue_jobs_fail_with_worker_timeout(client_factory):
    from datetime import timedelta

    from core.session import now_utc
    from core.supabase_client import get_supabase
    from services import jobs as job_service

    c = client_factory()
    old = (now_utc() - timedelta(seconds=200)).isoformat()
    job, _ = job_service.create_job(c.session_id, "generate_lesson", "key-overdue-001", "a" * 64)
    get_supabase().table("jobs").update({"created_at": old}).eq("id", job["id"]).execute()
    fresh, _ = job_service.create_job(c.session_id, "generate_lesson", "key-overdue-002", "b" * 64)

    assert job_service.fail_overdue({"generate_lesson": 60}, 15) >= 1
    got = c.get(f"/jobs/{job['id']}").json()
    assert got["status"] == "failed" and got["error_code"] == "worker_timeout" and got["error_message"]
    assert c.get(f"/jobs/{fresh['id']}").json()["status"] == "queued"
    # Job gagal karena sistem tidak memakan kuota tutorial pengguna.
    assert job_service.count_jobs(c.session_id, "generate_lesson") == 1
    assert not job_service.still_mine(job["id"], None)


def test_foreign_origin_cannot_change_data():
    from fastapi.testclient import TestClient

    import main

    c = TestClient(main.app)
    r = c.post("/sessions", json={}, headers={"Origin": "https://jahat.example"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "origin_not_allowed"
    assert c.get("/health", headers={"Origin": "https://jahat.example"}).status_code == 200  # baca tetap boleh (CORS yang membatasi)
    assert main.origin_allowed(main.settings.frontend_origins[0] + "/")
