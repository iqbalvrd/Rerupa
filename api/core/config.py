"""Konfigurasi aplikasi dari environment (.env)."""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: SecretStr | None = None
    database_url: SecretStr | None = None

    # OpenAI (diisi nanti)
    openai_api_key: SecretStr | None = None
    openai_text_model: str = ""
    openai_vision_model: str = ""

    # Sesi tamu
    session_cookie_name: str = "rerupa_session"
    session_ttl_days: int = 7
    # Lokal (localhost:3000 → localhost:8000) cukup "lax". Produksi lintas domain
    # (Vercel → Railway) butuh "none" + cookie_secure=true agar cookie ikut terkirim.
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_secure: bool = False

    # Unggahan
    max_upload_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 25_000_000

    # Kuota & biaya
    generate_quota_per_session: int = 3
    daily_ai_budget_usd: float = 5.0

    # Perilaku aplikasi
    checkpoint_count: int = 1
    lineart_method: str = "xdog"
    frontend_origin: str = "http://localhost:3000"
    feature_story: bool = False
    feature_recognition: bool = False

    # Worker
    worker_poll_seconds: float = 0.5
    worker_stale_after_seconds: int = 120

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
