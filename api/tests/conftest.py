"""Fixture bersama. Tes integrasi memakai project Supabase dari .env dan membersihkan datanya sendiri."""

import io
import warnings

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


def _supabase_ready() -> bool:
    try:
        from core.config import get_settings

        return get_settings().supabase_configured
    except Exception:
        return False


integration = pytest.mark.skipif(not _supabase_ready(), reason="Supabase belum dikonfigurasi di .env")


@pytest.fixture
def client_factory():
    """Membuat TestClient dengan sesi baru; semua sesi + file unggahan dibersihkan setelah tes."""
    from fastapi.testclient import TestClient

    from core.supabase_client import get_supabase
    from main import app

    created: list[str] = []

    def make(with_session: bool = True):
        client = TestClient(app)
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
