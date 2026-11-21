"""Event analitik minimum (PRD §19). Hanya ID teknis; tanpa gambar, tanpa jawaban bebas, tanpa ID sesi mentah."""

import logging

from core.supabase_client import get_supabase

log = logging.getLogger("rerupa.events")

SERVER_EVENTS = {"practice_started", "stage_completed", "checkpoint_requested", "lesson_completed", "session_deleted"}
CLIENT_EVENTS = {"lesson_viewed", "recipe_opened", "original_photo_opened", "feedback_shown", "reflection_answered", "story_opened", "recognition_confirmed"}
ALLOWED_PROPS = {"stage_order", "origin", "lesson_version_id", "correct", "suggestion_count", "text_source"}


def session_ref(session: dict | None) -> str | None:
    """Bagian hex safety_id (sudah berupa hash dari ID sesi)."""
    sid = (session or {}).get("safety_id") or ""
    return sid[3:] if sid.startswith("rs_") else None


def record(session: dict | None, name: str, props: dict | None = None) -> None:
    """Catat event; kegagalan tidak boleh mengganggu alur pengguna."""
    clean = {k: v for k, v in (props or {}).items() if k in ALLOWED_PROPS and v is not None}
    try:
        get_supabase().table("events").insert({"session_ref": session_ref(session), "name": name, "props": clean}).execute()
    except Exception:
        log.warning("event_record_failed", extra={"event": name})
