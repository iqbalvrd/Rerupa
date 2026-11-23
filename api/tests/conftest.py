"""Fixture bersama. Tes integrasi memakai project Supabase dari .env dan membersihkan datanya sendiri."""

import io
import os
import warnings

# Rate limit dimatikan untuk tes alur (semua request tes datang dari satu "IP");
# perilakunya diuji langsung di tests/test_release.py.
for _k in ("RATE_LIMIT_PER_IP_MINUTE", "RATE_LIMIT_PER_SESSION_MINUTE", "RATE_LIMIT_SESSIONS_PER_IP_HOUR", "RATE_LIMIT_UPLOADS_PER_IP_HOUR"):
    os.environ[_k] = "0"

import pytest
from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning)


def make_image(fmt: str = "PNG", size=(64, 48), color=(120, 60, 30), mode="RGB", exif=None) -> bytes:
    img = Image.new(mode, size, color if mode == "RGB" else color + (128,))
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


@pytest.fixture
def png_bytes() -> bytes:
    return make_image("PNG")


def pytest_configure(config):
    """Tes integrasi membuat & menghapus data dan menjalankan worker sendiri. Di database produksi,
    worker Railway ikut mengambil job uji (hasil tes acak) dan data uji mencemari produksi → tolak."""
    from core.config import get_settings

    if get_settings().environment == "production":
        pytest.exit("Tes menolak berjalan dengan ENVIRONMENT=production. Pakai api/.env (database dev/tes).", returncode=2)


def _supabase_ready() -> bool:
    try:
        from core.config import get_settings

        return get_settings().supabase_configured
    except Exception:
        return False


integration = pytest.mark.skipif(not _supabase_ready(), reason="Supabase belum dikonfigurasi di .env")


@pytest.fixture(scope="session")
def user_factory():
    """Akun Supabase Auth sungguhan (email terverifikasi) untuk tes. Return header Authorization.
    Semua akun uji (beserta profil & sesinya, lewat cascade) dihapus di akhir sesi pytest."""
    import uuid

    from supabase import ClientOptions, create_client

    from core.config import get_settings
    from core.supabase_client import get_supabase

    settings = get_settings()
    admin_api = get_supabase().auth.admin
    created: list[str] = []

    def make(role: str = "user") -> dict:
        email = f"pytest-{uuid.uuid4().hex[:12]}@rerupa.test"
        password = uuid.uuid4().hex
        user = admin_api.create_user({"email": email, "password": password, "email_confirm": True}).user
        created.append(user.id)
        if role != "user":
            get_supabase().table("profiles").update({"role": role}).eq("id", user.id).execute()
        # Klien terpisah: sign-in mengubah token klien, jangan sentuh klien service role bersama.
        auth_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key.get_secret_value(),
            options=ClientOptions(auto_refresh_token=False, persist_session=False),
        )
        session = auth_client.auth.sign_in_with_password({"email": email, "password": password}).session
        return {"id": user.id, "email": email, "headers": {"Authorization": f"Bearer {session.access_token}"}}

    yield make

    for uid in created:
        try:
            admin_api.delete_user(uid)
        except Exception:
            pass


@pytest.fixture(scope="session")
def test_user(user_factory) -> dict:
    return user_factory()


@pytest.fixture
def client_factory(test_user):
    """Membuat TestClient dengan sesi baru milik akun uji; semua sesi + file unggahan dibersihkan setelah tes."""
    from fastapi.testclient import TestClient

    from core.supabase_client import get_supabase
    from main import app

    created: list[str] = []

    def make(with_session: bool = True, user: dict | None = None):
        client = TestClient(app, headers=(user or test_user)["headers"])
        if with_session:
            res = client.post("/sessions", json={})
            assert res.status_code == 201
            created.append(res.json()["id"])
            client.session_id = res.json()["id"]
        return client

    yield make

    db = get_supabase()
    for sid in created:
        rows = db.table("uploads").select("raw_path, rectified_path").eq("session_id", sid).execute().data
        paths = [p for u in rows for p in (u["raw_path"], u["rectified_path"]) if p]
        if paths:
            db.storage.from_("uploads").remove(paths)
        from services.storage import remove_prefix

        remove_prefix("derived", sid)  # lapisan tutorial mode bebas
        db.table("practice_sessions").delete().eq("id", sid).execute()
