"""Panggilan OpenAI (Responses API + structured output) dengan pencatatan biaya.

Hanya modul ini yang berbicara ke OpenAI. Kunci API hanya dari env backend.
"""

import base64
import logging
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import TypeVar

from pydantic import BaseModel

from core.config import get_settings
from core.supabase_client import get_supabase

log = logging.getLogger("rerupa.ai")
T = TypeVar("T", bound=BaseModel)


class AIUnavailable(Exception):
    """AI tidak bisa dipakai (tidak dikonfigurasi, batas biaya, gangguan, penolakan)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class AIResult:
    parsed: BaseModel
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


@lru_cache(maxsize=1)
def _client():
    from openai import OpenAI

    settings = get_settings()
    return OpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=60.0, max_retries=1)


def image_part(jpeg_or_png: bytes, mime: str = "image/jpeg", detail: str = "high") -> dict:
    data = base64.b64encode(jpeg_or_png).decode("ascii")
    return {"type": "input_image", "image_url": f"data:{mime};base64,{data}", "detail": detail}


def today_cost_usd() -> float:
    from datetime import UTC, datetime

    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    rows = get_supabase().table("ai_usage").select("cost_usd").gte("created_at", start).execute().data
    return float(sum(float(r["cost_usd"]) for r in rows))


def ensure_available() -> None:
    settings = get_settings()
    if not settings.openai_configured or not settings.openai_vision_model:
        raise AIUnavailable("ai_unavailable")
    if settings.daily_ai_budget_usd > 0:
        spent = today_cost_usd()
        ratio = spent / settings.daily_ai_budget_usd
        if ratio >= 1:
            log.error("ai_budget_exceeded", extra={"spent_usd": round(spent, 4), "budget_usd": settings.daily_ai_budget_usd})
            raise AIUnavailable("budget_exceeded")
        if ratio >= 0.5:
            # Alarm 50% / 80% (SOLUSI_RISIKO §5): terlihat di log Railway.
            log.warning("ai_budget_warning", extra={"level": "80%" if ratio >= 0.8 else "50%", "spent_usd": round(spent, 4), "budget_usd": settings.daily_ai_budget_usd})


def parse(
    *,
    task: str,
    instructions: str,
    content: list[dict],
    schema: type[T],
    safety_id: str,
    job_id: str | None,
    max_output_tokens: int = 6000,
) -> AIResult:
    """Satu panggilan terstruktur. Melempar AIUnavailable untuk semua kegagalan yang bisa ditangani."""
    from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    settings = get_settings()
    model = settings.openai_vision_model
    start = time.perf_counter()
    outcome, usage_in, usage_out = "error", 0, 0
    try:
        effort = getattr(settings, "openai_reasoning_effort", "")
        extra = {"reasoning": {"effort": effort}} if effort else {}
        resp = _client().responses.parse(
            model=model,
            instructions=instructions,
            input=[{"role": "user", "content": content}],
            text_format=schema,
            safety_identifier=safety_id,
            max_output_tokens=max_output_tokens,
            store=False,
            **extra,
        )
        if resp.usage:
            usage_in, usage_out = resp.usage.input_tokens, resp.usage.output_tokens
        if resp.status == "incomplete":
            outcome = "truncated"
            raise AIUnavailable("ai_unavailable")
        if _refused(resp):
            outcome = "refusal"
            raise AIUnavailable("ai_refused")
        parsed = resp.output_parsed
        if parsed is None:
            outcome = "schema_error"
            raise AIUnavailable("ai_unavailable")
        outcome = "ok"
        return AIResult(parsed, model, usage_in, usage_out, int((time.perf_counter() - start) * 1000))
    except AIUnavailable:
        raise
    except APITimeoutError:
        outcome = "timeout"
        raise AIUnavailable("ai_unavailable") from None
    except (RateLimitError, APIConnectionError, APIStatusError) as exc:
        log.warning("openai_error", extra={"task": task, "error": type(exc).__name__})
        raise AIUnavailable("ai_unavailable") from None
    finally:
        _record_usage(job_id, model, task, usage_in, usage_out, outcome, int((time.perf_counter() - start) * 1000))


def _refused(resp) -> bool:
    for item in resp.output or []:
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", "") == "refusal":
                return True
    return False


def _record_usage(job_id, model, task, tokens_in, tokens_out, outcome, latency_ms) -> None:
    settings = get_settings()
    cost = tokens_in / 1e6 * settings.openai_price_input_per_m + tokens_out / 1e6 * settings.openai_price_output_per_m
    try:
        get_supabase().table("ai_usage").insert(
            {
                "job_id": job_id,
                "provider": "openai",
                "model": model or "unknown",
                "task": task,
                "input_tokens": tokens_in,
                "output_tokens": tokens_out,
                "cost_usd": round(cost, 5),
                "latency_ms": latency_ms,
                "outcome": outcome,
            }
        ).execute()
    except Exception:
        log.exception("ai_usage_record_failed")
