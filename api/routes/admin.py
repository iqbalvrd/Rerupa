"""Halaman admin: pengguna & peran, pemakaian AI, tinjau/terbitkan materi dan cerita koleksi.

Semua endpoint di sini dijaga require_admin (peran dibaca dari server, 403 untuk non-admin)."""

from collections import defaultdict
from datetime import timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from core.auth import CurrentUser, clear_auth_cache, require_admin
from core.errors import AppError
from core.session import now_utc
from core.supabase_client import get_supabase
from routes.lessons import clear_lesson_cache

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

Role = Literal["user", "admin"]
PublishStatus = Literal["draft", "in_review", "published", "archived"]


# ── Pengguna ──────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    id: UUID
    email: str
    role: Role
    created_at: str


class RoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Role


@router.get("/users", response_model=list[UserOut])
def list_users() -> list[UserOut]:
    rows = get_supabase().table("profiles").select("id, email, role, created_at").order("created_at", desc=True).limit(1000).execute().data
    return [UserOut(**r) for r in rows]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user_role(user_id: UUID, body: RoleUpdate, admin: CurrentUser = Depends(require_admin)) -> UserOut:
    if str(user_id) == admin.id:
        raise AppError("cannot_change_own_role", 409)
    rows = get_supabase().table("profiles").update({"role": body.role}).eq("id", str(user_id)).execute().data
    if not rows:
        raise AppError("not_found", 404)
    clear_auth_cache()  # peran baru berlaku di request berikutnya
    r = rows[0]
    return UserOut(id=r["id"], email=r["email"], role=r["role"], created_at=r["created_at"])


# ── Pemakaian AI ──────────────────────────────────────────────────────────


class UsageBucket(BaseModel):
    key: str
    calls: int
    cost_usd: float
    input_tokens: int
    output_tokens: int
    image_count: int
    failures: int


class UsageOut(BaseModel):
    days: int
    total: UsageBucket
    by_day: list[UsageBucket]
    by_task: list[UsageBucket]
    by_model: list[UsageBucket]


def _bucket(key: str, rows: list[dict]) -> UsageBucket:
    return UsageBucket(
        key=key,
        calls=len(rows),
        cost_usd=round(sum(float(r["cost_usd"] or 0) for r in rows), 5),
        input_tokens=sum(r["input_tokens"] or 0 for r in rows),
        output_tokens=sum(r["output_tokens"] or 0 for r in rows),
        image_count=sum(r["image_count"] or 0 for r in rows),
        failures=sum(1 for r in rows if r["outcome"] != "ok"),
    )


def _group(rows: list[dict], key) -> list[UsageBucket]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[key(r)].append(r)
    return [_bucket(k, v) for k, v in groups.items()]


@router.get("/ai-usage", response_model=UsageOut)
def ai_usage(days: int = Query(7, ge=1, le=90)) -> UsageOut:
    since = (now_utc() - timedelta(days=days)).isoformat()
    db = get_supabase()
    rows: list[dict] = []
    page = 1000
    while True:  # PostgREST membatasi baris per respons; ambil bertahap
        chunk = (
            db.table("ai_usage")
            .select("task, model, input_tokens, output_tokens, image_count, cost_usd, outcome, created_at")
            .gte("created_at", since)
            .order("created_at")
            .range(len(rows), len(rows) + page - 1)
            .execute()
            .data
        )
        rows.extend(chunk)
        if len(chunk) < page or len(rows) >= 50_000:
            break
    by_day = sorted(_group(rows, lambda r: r["created_at"][:10]), key=lambda b: b.key)
    by_cost = lambda b: -b.cost_usd  # noqa: E731
    return UsageOut(
        days=days,
        total=_bucket("total", rows),
        by_day=by_day,
        by_task=sorted(_group(rows, lambda r: r["task"]), key=by_cost),
        by_model=sorted(_group(rows, lambda r: r["model"]), key=by_cost),
    )


# ── Materi & cerita koleksi ───────────────────────────────────────────────


class LessonItem(BaseModel):
    id: UUID
    version: int
    status: str
    created_at: str


class StoryItem(BaseModel):
    id: UUID
    lesson_version_id: UUID
    title: str | None
    status: str
    review_status: str


class ContentItem(BaseModel):
    id: UUID
    slug: str
    title: str
    status: str
    license: str
    updated_at: str | None
    lessons: list[LessonItem]
    stories: list[StoryItem]


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: PublishStatus


@router.get("/content", response_model=list[ContentItem])
def list_content() -> list[ContentItem]:
    db = get_supabase()
    arts = db.table("artworks").select("id, slug, title, status, license, updated_at").order("title").execute().data
    lessons = (
        db.table("lesson_versions").select("id, artwork_id, version, status, created_at").eq("origin", "collection").order("version", desc=True).execute().data
    )
    lesson_ids = [lv["id"] for lv in lessons]
    stories = (
        db.table("stories").select("id, lesson_version_id, title, status, review_status").is_("session_id", "null").in_("lesson_version_id", lesson_ids).execute().data
        if lesson_ids
        else []
    )
    art_of_lesson = {lv["id"]: lv["artwork_id"] for lv in lessons}
    by_art_lessons: dict[str, list[dict]] = defaultdict(list)
    by_art_stories: dict[str, list[dict]] = defaultdict(list)
    for lv in lessons:
        by_art_lessons[lv["artwork_id"]].append(lv)
    for st in stories:
        by_art_stories[art_of_lesson[st["lesson_version_id"]]].append(st)
    return [
        ContentItem(
            **a,
            lessons=[LessonItem(**{k: lv[k] for k in LessonItem.model_fields}) for lv in by_art_lessons[a["id"]]],
            stories=[StoryItem(**s) for s in by_art_stories[a["id"]]],
        )
        for a in arts
    ]


@router.patch("/artworks/{artwork_id}", response_model=dict)
def update_artwork_status(artwork_id: UUID, body: StatusUpdate) -> dict:
    db = get_supabase()
    found = db.table("artworks").select("license").eq("id", str(artwork_id)).limit(1).execute().data
    if not found:
        raise AppError("not_found", 404)
    if body.status == "published" and found[0]["license"] == "unknown":
        raise AppError("license_unknown", 409)  # sama dengan constraint artworks_publish_needs_license
    db.table("artworks").update({"status": body.status}).eq("id", str(artwork_id)).execute()
    clear_lesson_cache()
    return {"id": str(artwork_id), "status": body.status}


@router.patch("/lessons/{lesson_id}", response_model=dict)
def update_lesson_status(lesson_id: UUID, body: StatusUpdate, admin: CurrentUser = Depends(require_admin)) -> dict:
    db = get_supabase()
    found = db.table("lesson_versions").select("origin").eq("id", str(lesson_id)).limit(1).execute().data
    if not found or found[0]["origin"] != "collection":  # tutorial mode bebas milik sesi pengguna
        raise AppError("not_found", 404)
    db.table("lesson_versions").update({"status": body.status, "reviewer": admin.email}).eq("id", str(lesson_id)).execute()
    clear_lesson_cache()
    return {"id": str(lesson_id), "status": body.status}


@router.patch("/stories/{story_id}", response_model=dict)
def update_story_status(story_id: UUID, body: StatusUpdate) -> dict:
    db = get_supabase()
    found = db.table("stories").select("session_id").eq("id", str(story_id)).limit(1).execute().data
    if not found or found[0]["session_id"] is not None:  # cerita pribadi sesi tidak ditinjau admin
        raise AppError("not_found", 404)
    db.table("stories").update({"review_status": body.status}).eq("id", str(story_id)).execute()
    return {"id": str(story_id), "review_status": body.status}
