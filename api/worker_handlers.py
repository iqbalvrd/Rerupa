"""Handler per jenis job. Tiap handler menerima baris job dan mengembalikan JobOutcome.

Fase 1: generate_lesson belum punya pipeline (Fase 2–4), jadi job diselesaikan sebagai
failed/pipeline_not_ready — jujur ke frontend, bukan pura-pura berhasil.
"""

from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass
class JobOutcome:
    status: str  # succeeded | needs_retake | failed
    result: dict | None = None
    error_code: str | None = None
    lesson_version_id: str | None = None
    extra: dict = field(default_factory=dict)


Handler = Callable[[dict], JobOutcome]


def handle_generate_lesson(job: dict) -> JobOutcome:
    return JobOutcome(status="failed", error_code="pipeline_not_ready")


HANDLERS: dict[str, Handler] = {
    "generate_lesson": handle_generate_lesson,
}
