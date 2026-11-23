"""Akun & peran: login wajib untuk latihan, verifikasi token di server, route admin menolak non-admin."""

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from conftest import integration
from core.auth import CurrentUser, bearer_token, claim_session, clear_auth_cache
from core.errors import AppError


def _req(headers: dict[str, str]) -> Request:
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_bearer_token_parsing():
    assert bearer_token(_req({"Authorization": "Bearer abc.def"})) == "abc.def"
    assert bearer_token(_req({"Authorization": "bearer abc"})) == "abc"
    assert bearer_token(_req({"Authorization": "Basic abc"})) is None
    assert bearer_token(_req({"Authorization": "Bearer "})) is None
    assert bearer_token(_req({})) is None
    assert bearer_token(_req({"Authorization": "Bearer " + "x" * 5000})) is None


@pytest.fixture
def app():
    from main import app

    clear_auth_cache()
    return app


@integration
def test_practice_requires_login(app):
    c = TestClient(app)
    res = c.post("/sessions", json={})
    assert res.status_code == 401 and res.json()["error"]["code"] == "login_required"
    forged = c.post("/sessions", json={}, headers={"Authorization": "Bearer bukan.token.asli"})
    assert forged.status_code == 401
    # Melihat koleksi tetap tanpa akun.
    assert c.get("/artworks").status_code == 200
    assert c.get("/auth/me").status_code == 401


@integration
def test_signup_creates_profile_and_me(app, user_factory):
    from core.supabase_client import get_supabase

    u = user_factory()
    rows = get_supabase().table("profiles").select("email, role").eq("id", u["id"]).execute().data
    assert rows == [{"email": u["email"], "role": "user"}]
    me = TestClient(app).get("/auth/me", headers=u["headers"]).json()
    assert me == {"id": u["id"], "email": u["email"], "role": "user"}


@integration
def test_session_belongs_to_user(app, client_factory, test_user):
    from core.supabase_client import get_supabase

    c = client_factory()
    row = get_supabase().table("practice_sessions").select("user_id").eq("id", c.session_id).execute().data[0]
    assert row["user_id"] == test_user["id"]


@integration
def test_claim_session(client_factory, user_factory):
    from core.session import SESSION_COLUMNS
    from core.supabase_client import get_supabase

    db = get_supabase()
    c = client_factory()
    db.table("practice_sessions").update({"user_id": None}).eq("id", c.session_id).execute()
    other = user_factory()
    session = db.table("practice_sessions").select(SESSION_COLUMNS).eq("id", c.session_id).execute().data[0]
    claim_session(session, CurrentUser(id=other["id"], email=other["email"], role="user"))  # sesi tamu lama → ditautkan
    assert db.table("practice_sessions").select("user_id").eq("id", c.session_id).execute().data[0]["user_id"] == other["id"]
    session = db.table("practice_sessions").select(SESSION_COLUMNS).eq("id", c.session_id).execute().data[0]
    with pytest.raises(AppError) as err:
        claim_session(session, CurrentUser(id="00000000-0000-0000-0000-000000000001", email="x@y.z", role="user"))
    assert err.value.status_code == 404


@integration
def test_upload_to_other_users_session_is_hidden(app, client_factory, user_factory):
    """Token sesi bocor tidak cukup: unggahan juga butuh akun pemilik sesi."""
    a = client_factory()
    token = a.cookies.get("rerupa_session")
    intruder = user_factory()
    res = TestClient(app).post(
        "/lessons/generate",
        files={"file": ("f.png", b"x", "image/png")},
        data={"consent_ai_photo": "true"},
        headers={**intruder["headers"], "X-Session-Token": token, "Idempotency-Key": "key-intruder-01"},
    )
    assert res.status_code == 404


@integration
def test_admin_routes_reject_non_admin(app, user_factory):
    user = user_factory()
    c = TestClient(app)
    for path in ("/admin/users", "/admin/ai-usage", "/admin/content"):
        assert c.get(path).status_code == 401
        res = c.get(path, headers=user["headers"])
        assert res.status_code == 403 and res.json()["error"]["code"] == "admin_required"
    assert c.patch(f"/admin/users/{user['id']}", json={"role": "admin"}, headers=user["headers"]).status_code == 403


@integration
def test_admin_can_manage_roles_and_read_dashboards(app, user_factory):
    admin, user = user_factory("admin"), user_factory()
    c = TestClient(app, headers=admin["headers"])
    assert c.get("/auth/me").json()["role"] == "admin"

    users = c.get("/admin/users").json()
    assert {admin["id"], user["id"]} <= {u["id"] for u in users}
    assert c.patch(f"/admin/users/{admin['id']}", json={"role": "user"}).status_code == 409
    assert c.patch(f"/admin/users/{user['id']}", json={"role": "superuser"}).status_code == 422

    assert c.patch(f"/admin/users/{user['id']}", json={"role": "admin"}).json()["role"] == "admin"
    assert TestClient(app).get("/admin/users", headers=user["headers"]).status_code == 200  # berlaku langsung
    c.patch(f"/admin/users/{user['id']}", json={"role": "user"})
    assert TestClient(app).get("/admin/users", headers=user["headers"]).status_code == 403

    usage = c.get("/admin/ai-usage", params={"days": 3}).json()
    assert usage["days"] == 3 and usage["total"]["calls"] == sum(d["calls"] for d in usage["by_day"])
    assert c.get("/admin/ai-usage", params={"days": 0}).status_code == 422
    assert isinstance(c.get("/admin/content").json(), list)
    assert c.patch("/admin/lessons/00000000-0000-0000-0000-000000000000", json={"status": "published"}).status_code == 404


@integration
def test_admin_content_status_roundtrip(app, user_factory):
    from core.supabase_client import get_supabase

    db = get_supabase()
    art = db.table("artworks").insert(
        {"slug": "pytest-admin-tinjau", "title": "Uji admin", "image_path": "x.jpg", "thumbnail_path": "x.jpg", "license": "cc0"}
    ).execute().data[0]
    unknown = db.table("artworks").insert(
        {"slug": "pytest-admin-lisensi", "title": "Uji lisensi", "image_path": "x.jpg", "thumbnail_path": "x.jpg"}
    ).execute().data[0]
    try:
        c = TestClient(app, headers=user_factory("admin")["headers"])
        assert any(a["slug"] == "pytest-admin-tinjau" for a in c.get("/admin/content").json())
        assert c.patch(f"/admin/artworks/{art['id']}", json={"status": "published"}).status_code == 200
        assert "pytest-admin-tinjau" in [a["slug"] for a in TestClient(app).get("/artworks").json()]
        assert c.patch(f"/admin/artworks/{art['id']}", json={"status": "draft"}).status_code == 200
        assert "pytest-admin-tinjau" not in [a["slug"] for a in TestClient(app).get("/artworks").json()]
        res = c.patch(f"/admin/artworks/{unknown['id']}", json={"status": "published"})
        assert res.status_code == 409 and res.json()["error"]["code"] == "license_unknown"
    finally:
        db.table("artworks").delete().in_("id", [art["id"], unknown["id"]]).execute()


@integration
def test_admin_emails_bootstrap(app, user_factory, monkeypatch):
    from core.config import get_settings
    from core.supabase_client import get_supabase

    u = user_factory()
    monkeypatch.setattr(get_settings(), "admin_emails", "lain@contoh.id, " + u["email"].upper())
    clear_auth_cache()
    assert TestClient(app).get("/auth/me", headers=u["headers"]).json()["role"] == "admin"
    assert get_supabase().table("profiles").select("role").eq("id", u["id"]).execute().data[0]["role"] == "admin"
