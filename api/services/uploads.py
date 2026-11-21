"""Validasi dan penyimpanan unggahan foto.

Aturan (PRD FR02, §16, §17):
- Hanya JPEG, PNG, WebP — dicek dari isi file (magic bytes), bukan nama/ekstensi.
- Maks 10 MB dan 25 megapiksel (lindungi dari decompression bomb).
- Orientasi EXIF diterapkan lalu SEMUA metadata dibuang (termasuk lokasi GPS).
- Yang disimpan hanya salinan bersih (JPEG) di bucket privat `uploads`; file asli tidak disimpan.
"""

import io
import logging
import warnings
from dataclasses import dataclass
from typing import BinaryIO
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from core.config import get_settings
from core.errors import AppError
from core.security import sha256_hex
from core.session import now_utc
from core.supabase_client import get_supabase
from services.storage import is_duplicate, remove_prefix, with_retry

log = logging.getLogger("rerupa.uploads")

BUCKET = "uploads"
_PIL_FORMAT_TO_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


@dataclass
class CleanImage:
    jpeg_bytes: bytes
    width: int
    height: int
    source_mime: str


def read_limited(stream: BinaryIO, max_bytes: int) -> bytes:
    """Baca maksimal max_bytes; lebih dari itu langsung ditolak tanpa membaca sisanya."""
    data = stream.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise AppError("file_too_large", 413)
    if not data:
        raise AppError("file_invalid", 422)
    return data


def sniff_mime(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def clean_image(data: bytes, max_pixels: int | None = None) -> CleanImage:
    """Validasi isi gambar dan hasilkan JPEG bersih tanpa metadata."""
    max_pixels = max_pixels or get_settings().max_image_pixels
    mime = sniff_mime(data[:16])
    if mime is None:
        raise AppError("file_invalid", 422)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = max_pixels
            with Image.open(io.BytesIO(data)) as img:
                # Isi harus sesuai dengan magic bytes (cegah file "menyamar").
                if _PIL_FORMAT_TO_MIME.get(img.format or "") != mime:
                    raise AppError("file_invalid", 422)
                width, height = img.size
                if width * height > max_pixels:
                    raise AppError("image_too_large", 413)
                img.seek(0)  # gambar animasi: pakai frame pertama
                img.load()
                upright = ImageOps.exif_transpose(img)
                rgb = _to_rgb(upright)
    except AppError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise AppError("image_too_large", 413) from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError):
        raise AppError("file_invalid", 422) from None

    out = io.BytesIO()
    # Tanpa argumen exif/icc_profile → metadata tidak ikut tersimpan.
    rgb.save(out, format="JPEG", quality=92, optimize=True)
    return CleanImage(jpeg_bytes=out.getvalue(), width=rgb.width, height=rgb.height, source_mime=mime)


def _to_rgb(img: Image.Image) -> Image.Image:
    """Gabungkan transparansi ke latar putih, lalu RGB."""
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def store_upload(
    session_id: str,
    original: bytes,
    clean: CleanImage,
    purpose: str,
    stage_id: str | None = None,
) -> dict:
    """Simpan JPEG bersih ke Storage lalu catat di tabel uploads. Bila pencatatan gagal, file dihapus lagi."""
    if purpose not in ("reference", "progress"):
        raise ValueError("purpose tidak valid")
    if purpose == "progress" and not stage_id:
        raise ValueError("unggahan progress wajib punya stage_id")

    upload_id = str(uuid4())
    path = f"{session_id}/{upload_id}.jpg"
    storage = get_supabase().storage.from_(BUCKET)
    with_retry(
        lambda: storage.upload(path, clean.jpeg_bytes, {"content-type": "image/jpeg", "upsert": "false"}),
        "upload",
        already_done=is_duplicate,
    )
    try:
        return (
            get_supabase()
            .table("uploads")
            .insert(
                {
                    "id": upload_id,
                    "session_id": session_id,
                    "purpose": purpose,
                    "stage_id": stage_id,
                    "raw_path": path,
                    "sha256": sha256_hex(original),
                    "mime": clean.source_mime,
                    "width": clean.width,
                    "height": clean.height,
                }
            )
            .execute()
            .data[0]
        )
    except Exception:
        with_retry(lambda: storage.remove([path]), "remove")
        raise


def purge_session_files(session_id: str) -> int:
    """Hapus semua file unggahan milik sesi dari Storage dan tandai purged. Dipanggil saat sesi dihapus."""
    db = get_supabase()
    rows = (
        db.table("uploads")
        .select("id, raw_path, normalized_path, rectified_path")
        .eq("session_id", session_id)
        .is_("purged_at", "null")
        .execute()
        .data
    )
    paths = [p for r in rows for p in (r["raw_path"], r["normalized_path"], r["rectified_path"]) if p]
    if paths:
        with_retry(lambda: db.storage.from_(BUCKET).remove(paths), "purge")
    if rows:
        db.table("uploads").update(
            {"raw_path": None, "normalized_path": None, "rectified_path": None, "purged_at": now_utc().isoformat()}
        ).in_("id", [r["id"] for r in rows]).execute()
    # Lapisan tutorial mode bebas (turunan foto) milik sesi ini.
    return len(paths) + remove_prefix("derived", session_id)


def discard_upload(upload: dict) -> None:
    """Hapus unggahan yang tidak jadi dipakai (mis. kalah balapan idempotensi)."""
    if upload.get("raw_path"):
        get_supabase().storage.from_(BUCKET).remove([upload["raw_path"]])
    get_supabase().table("uploads").delete().eq("id", upload["id"]).execute()
