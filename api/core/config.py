"""Konfigurasi aplikasi dari environment (.env)."""

import os
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # .env = pengembangan & tes (database dev). Operasi ke produksi memakai file lain secara sengaja:
    #   RERUPA_ENV_FILE=.env.prod uv run python scripts/import_collection.py …
    # Di Railway tidak ada file .env: semua nilai dari variabel lingkungan.
    model_config = SettingsConfigDict(env_file=os.environ.get("RERUPA_ENV_FILE", ".env"), env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: SecretStr | None = None
    database_url: SecretStr | None = None

    # OpenAI (diisi nanti)
    openai_api_key: SecretStr | None = None
    openai_text_model: str = ""
    openai_vision_model: str = ""
    # Harga per 1 juta token untuk model terpilih (isi dari halaman harga OpenAI) — dipakai
    # untuk mencatat biaya di ai_usage dan menegakkan DAILY_AI_BUDGET_USD.
    openai_price_input_per_m: float = 0.0
    openai_price_output_per_m: float = 0.0
    # Usaha penalaran model (none|low|medium|high; kosong = bawaan model). "low" cukup untuk menulis
    # teks dari data terstruktur dan menjaga latensi/biaya (uji model: eval/HASIL_UJI_MODEL.md).
    openai_reasoning_effort: str = "low"
    # Storyline (P1): panel gambar. Harga token gambar per 1 juta (halaman harga OpenAI 21 Nov 2026).
    openai_image_model_draft: str = "gpt-image-2.6-flare"
    openai_image_model_final: str = "gpt-image-2.6-sunburst"
    openai_image_price_input_per_m: float = 8.0
    openai_image_price_output_per_m: float = 30.0

    # Sesi tamu
    session_cookie_name: str = "rerupa_session"
    session_ttl_days: int = 7
    # Lokal (localhost:3000 → localhost:8000) cukup "lax". Produksi lintas domain
    # (Vercel → Railway) butuh "none" + cookie_secure=true agar cookie ikut terkirim.
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_secure: bool = False

    # Akun: email (dipisah koma) yang otomatis jadi admin setelah emailnya terverifikasi.
    # Admin lain diangkat dari halaman admin (profiles.role). Menghapus email di sini tidak menurunkan peran.
    admin_emails: str = ""

    # Unggahan
    max_upload_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 25_000_000

    # Kuota & biaya
    generate_quota_per_session: int = 3
    # PRD §17: satu retry per checkpoint → maks 2 feedback berhasil per tahap; foto ulang
    # (needs_retake) tidak dihitung, tetapi total percobaan per tahap tetap dibatasi.
    checkpoint_feedback_per_stage: int = 2
    checkpoint_attempts_per_stage: int = 6
    feedback_deadline_seconds: int = 45
    daily_ai_budget_usd: float = 5.0

    # Perilaku aplikasi
    # Versi showcase: 2 checkpoint (setelah sketsa + setelah bidang sedang). Versi awal: 1.
    checkpoint_count: int = 2
    # Hasil evaluasi Fase 2 (eval/HASIL_FASE2.md): TEED cukup cepat di CPU untuk mode bebas;
    # "model" (Informative Drawings) lebih bersih tetapi 2–36 s di CPU → dipakai untuk materi koleksi.
    lineart_method: str = "teed"
    lineart_method_collection: str = "model"
    # u2net 2–3× lebih cepat dari isnet dengan hasil hampir sama di foto uji.
    mask_model: str = "u2net"
    # Kualitas bidang & garis (PR #23). Bisa diturunkan lewat variabel tanpa build ulang bila RAM worker mepet.
    cv_max_colors: int = 12
    line_thin: bool = True
    # Satu atau beberapa origin dipisah koma (produksi: domain Vercel). Preview Vercel lewat regex,
    # mis. ^https://rerupa-[a-z0-9-]+\.vercel\.app$ — kosong = tidak ada.
    frontend_origin: str = "http://localhost:3000"
    frontend_origin_regex: str = ""
    # P1: storyline cerita & pencocokan foto ke koleksi (RENCANA §4.8)
    feature_story: bool = False
    feature_recognition: bool = False
    story_max_web_searches: int = 3

    # Worker
    worker_poll_seconds: float = 0.5
    worker_idle_max_seconds: float = 2.0  # jeda polling maksimum saat antrean kosong
    # Jalur pemroses paralel per worker. 2: satu job menunggu OpenAI sementara job lain memakai CPU.
    # Memori puncak ±1,2 GB per jalur CV → worker 2 jalur butuh ±3 GB.
    worker_concurrency: int = 2
    worker_stale_after_seconds: int = 120
    # PRD §16: batas tunggu analisis (sejak permintaan dibuat). Lewat batas + toleransi → failed/worker_timeout.
    generate_deadline_seconds: int = 60
    deadline_grace_seconds: int = 15
    retention_every_seconds: int = 900  # 15 menit (PRD §17: foto & sesi terhapus dibersihkan ≤24 jam)

    # Produksi
    environment: Literal["development", "production"] = "development"
    # Di belakang proxy Railway/Fly: IP klien dibaca dari X-Real-IP / X-Forwarded-For.
    # Jangan aktifkan tanpa proxy — header itu bisa dipalsukan klien.
    trust_proxy_headers: bool = False
    expose_docs: bool = True  # /docs dan /openapi.json; produksi sebaiknya false

    # Rate limit (per proses API, jendela 60 s / 3600 s). 0 = nonaktif.
    # Per IP longgar: peserta uji di satu Wi-Fi berbagi IP (8 orang × polling 60/menit). Batas per sesi
    # yang menahan satu pengguna yang berlebihan.
    rate_limit_per_ip_minute: int = 600
    rate_limit_per_session_minute: int = 180  # polling /jobs tiap 1 s ≈ 60/menit
    rate_limit_sessions_per_ip_hour: int = 60
    rate_limit_uploads_per_ip_hour: int = 80  # generate + checkpoint (≈10 orang × 1 tutorial + 2 checkpoint, + ulang)

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    def production_problems(self) -> list[str]:
        """Konfigurasi yang wajib benar sebelum melayani pengguna di produksi."""
        problems = []
        if self.environment != "production":
            return problems
        if not self.supabase_configured:
            problems.append("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY kosong")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE harus true")
        if any(o.startswith("http://") and "localhost" not in o for o in self.frontend_origins) or not self.frontend_origins:
            problems.append("FRONTEND_ORIGIN harus domain https frontend")
        if not self.trust_proxy_headers:
            problems.append("TRUST_PROXY_HEADERS harus true di belakang proxy Railway/Fly (tanpa itu semua pengguna berbagi satu IP di rate limit)")
        if self.openai_configured and self.daily_ai_budget_usd <= 0:
            problems.append("DAILY_AI_BUDGET_USD harus > 0 bila OpenAI aktif")
        if self.openai_configured and (self.openai_price_input_per_m <= 0 or self.openai_price_output_per_m <= 0):
            problems.append("OPENAI_PRICE_INPUT_PER_M/OUTPUT_PER_M wajib diisi agar batas biaya bekerja")
        return problems

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and _filled(self.supabase_service_role_key))

    @property
    def openai_configured(self) -> bool:
        return _filled(self.openai_api_key)


def _filled(secret: SecretStr | None) -> bool:
    """True bila rahasia ada dan tidak kosong (baris `KEY=` di .env dianggap belum diisi)."""
    return secret is not None and secret.get_secret_value().strip() != ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
