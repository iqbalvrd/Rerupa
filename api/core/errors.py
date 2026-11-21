"""Error terstandar: setiap kegagalan punya kode yang bisa dipetakan ke pesan UI.

Format respons: {"error": {"code": "...", "message": "..."}}
Detail internal (stack trace, pesan database) tidak pernah dikirim ke klien.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("rerupa.errors")

# Kode → pesan untuk pengguna (Bahasa Indonesia). Lihat SYSTEM_ARCHITECTURE.md §7.3.
MESSAGES: dict[str, str] = {
    "session_required": "Sesi tidak ditemukan atau sudah berakhir. Mulai sesi baru.",
    "not_found": "Data tidak ditemukan.",
    "validation_error": "Data yang dikirim tidak lengkap atau tidak sesuai.",
    "idempotency_key_required": "Permintaan ini butuh header Idempotency-Key.",
    "idempotency_conflict": "Kunci permintaan sudah dipakai untuk data yang berbeda.",
    "file_too_large": "File terlalu besar. Maksimal 10 MB.",
    "file_invalid": "File tidak didukung. Pakai JPG, PNG, atau WebP ≤10 MB.",
    "image_too_large": "Resolusi gambar terlalu besar. Maksimal 25 megapiksel.",
    "consent_required": "Setujui pengiriman foto ke AI, atau pilih materi dari galeri.",
    "photo_unusable": "Foto kurang jelas. Coba ambil ulang di tempat terang.",
    "not_artwork": "Sepertinya bukan karya lukis. Pilih dari galeri?",
    "too_complex": "Karyanya rumit. Coba potong bagian yang lebih kecil.",
    "alignment_failed": "Sudut belum pas. Tap ulang keempat sudut bidang dan pastikan garis grid terlihat.",
    "sketch_not_visible": "Garis sketsa belum terlihat di foto. Tebalkan garis atau foto lebih dekat di tempat terang.",
    "lesson_required": "Pilih materi atau buat tutorial dulu.",
    "not_checkpoint": "Tahap ini tidak meminta foto progres.",
    "checkpoint_quota_exceeded": "Batas feedback untuk tahap ini tercapai. Lanjutkan ke tahap berikutnya.",
    "quota_exceeded": "Batas latihan sesi ini tercapai.",
    "budget_exceeded": "Fitur AI sedang penuh. Coba materi dari galeri.",
    "ai_unavailable": "Instruksi otomatis belum tersedia. Tahapan tetap bisa dipakai.",
    "ai_refused": "Bagian ini tidak bisa dibuat otomatis.",
    "pipeline_not_ready": "Pembuatan tutorial otomatis belum tersedia.",
    "worker_timeout": "Proses terlalu lama. Coba lagi.",
    "session_deleted": "Sesi sudah dihapus, jadi proses ini dibatalkan.",
    "internal_error": "Terjadi kesalahan di server. Coba lagi.",
}


def message_for(code: str | None) -> str | None:
    if code is None:
        return None
    return MESSAGES.get(code, MESSAGES["internal_error"])


class AppError(Exception):
    def __init__(self, code: str, status_code: int = 400):
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def _body(code: str) -> dict:
    return {"error": {"code": code, "message": message_for(code)}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        body = _body("validation_error")
        # Hanya lokasi field yang salah, tanpa nilai yang dikirim pengguna.
        body["error"]["fields"] = [".".join(str(p) for p in e["loc"]) for e in exc.errors()]
        return JSONResponse(status_code=422, content=body)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse(status_code=500, content=_body("internal_error"))
