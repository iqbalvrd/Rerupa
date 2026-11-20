"""Tes unit tanpa jaringan: keamanan, validasi gambar, idempotency key, pesan error."""

import io

import pytest
from PIL import Image

from conftest import make_image
from core.errors import MESSAGES, AppError, message_for
from core.idempotency import idempotency_key
from core.security import hash_token, new_session_token, payload_hash, safety_id_for
from services.uploads import clean_image, read_limited, sniff_mime


# ---------- token & hash ----------

def test_session_token_is_random_and_long():
    tokens = {new_session_token() for _ in range(50)}
    assert len(tokens) == 50
    assert all(len(t) >= 43 for t in tokens)


def test_hash_token_is_sha256_hex():
    h = hash_token("abc")
    assert len(h) == 64 and all(c in "0123456789abcdef" for c in h)
    assert h != hash_token("abd")


def test_safety_id_does_not_leak_session_id():
    sid = "5b0e9a71-2c3d-4f8e-a1b2-c3d4e5f60718"
    sid_hash = safety_id_for(sid)
    assert sid not in sid_hash and sid_hash.startswith("rs_")


def test_payload_hash_changes_with_content():
    assert payload_hash("a", "b") == payload_hash("a", "b")
    assert payload_hash("a", "b") != payload_hash("a", "c")


# ---------- idempotency key ----------

@pytest.mark.parametrize("key", ["123e4567-e89b-12d3-a456-426614174000", "aksi_unggah:01"])
def test_idempotency_key_accepts_safe_keys(key):
    assert idempotency_key(key) == key


@pytest.mark.parametrize("key,code", [(None, "idempotency_key_required"), ("pendek", "validation_error"), ("ada spasi di sini", "validation_error")])
def test_idempotency_key_rejects_bad_keys(key, code):
    with pytest.raises(AppError) as exc:
        idempotency_key(key)
    assert exc.value.code == code


# ---------- validasi gambar ----------

def test_sniff_mime():
    assert sniff_mime(make_image("JPEG")[:16]) == "image/jpeg"
    assert sniff_mime(make_image("PNG")[:16]) == "image/png"
    assert sniff_mime(make_image("WEBP")[:16]) == "image/webp"
    assert sniff_mime(b"GIF89a.........") is None


def test_read_limited_rejects_too_large():
    with pytest.raises(AppError) as exc:
        read_limited(io.BytesIO(b"x" * 101), 100)
    assert exc.value.code == "file_too_large"


def test_read_limited_rejects_empty():
    with pytest.raises(AppError) as exc:
        read_limited(io.BytesIO(b""), 100)
    assert exc.value.code == "file_invalid"


def test_clean_image_strips_exif_and_applies_orientation():
    exif = Image.Exif()
    exif[0x0112] = 6  # putar 90°
    exif[0x010F] = "KameraRahasia"
    exif[0x8825] = {1: "S", 2: (6.0, 10.0, 0.0)}  # GPS
    data = make_image("JPEG", size=(80, 60), exif=exif)

    clean = clean_image(data)
    out = Image.open(io.BytesIO(clean.jpeg_bytes))
    assert out.format == "JPEG"
    assert (clean.width, clean.height) == (60, 80)
    assert len(out.getexif()) == 0
    assert clean.source_mime == "image/jpeg"


def test_clean_image_flattens_transparency_to_white():
    data = make_image("PNG", size=(10, 10), color=(0, 0, 0), mode="RGBA")
    clean = clean_image(data)
    assert Image.open(io.BytesIO(clean.jpeg_bytes)).mode == "RGB"


@pytest.mark.parametrize(
    "data",
    [
        b"bukan gambar sama sekali",
        b"\xff\xd8\xff" + make_image("PNG"),  # PNG menyamar sebagai JPEG
        make_image("PNG")[:40],  # file terpotong
    ],
)
def test_clean_image_rejects_invalid(data):
    with pytest.raises(AppError) as exc:
        clean_image(data)
    assert exc.value.code == "file_invalid"


def test_clean_image_rejects_too_many_pixels():
    data = make_image("PNG", size=(300, 300))
    with pytest.raises(AppError) as exc:
        clean_image(data, max_pixels=50_000)
    assert exc.value.code == "image_too_large"


# ---------- pesan error ----------

def test_every_error_code_has_indonesian_message():
    assert all(isinstance(v, str) and v for v in MESSAGES.values())
    assert message_for("kode_tidak_dikenal") == MESSAGES["internal_error"]
    assert message_for(None) is None
