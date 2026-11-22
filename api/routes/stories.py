"""Storyline cerita (P1): POST /lessons/{id}/story dan GET /stories/{id}. Aktif bila FEATURE_STORY=true.

Alur untuk frontend (lihat API.md):
- Materi koleksi → cerita kurasi yang sudah ditinjau (200, langsung) atau 404 story_not_available.
- Foto unggahan:
  - `confirm_artwork_id` (dari "Apakah ini …?" hasil pencocokan) → pakai cerita koleksi (200, langsung).
  - Selain itu → job `generate_story` (202). Hasil job: `kind` = story. Foto unggahan diriset otomatis (kenali → sumber web → keyakinan), tanpa bertanya ke pengguna.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from core.config import get_settings
from core.errors import AppError
from core.idempotency import idempotency_key
from core.security import payload_hash
from core.session import current_session
from core.supabase_client import get_supabase
from routes.jobs import JobOut, to_job_out
from services import jobs as job_service
from services.storage import CATALOG_URL_TTL, PRIVATE_URL_TTL, signed_urls
from story.service import BASIS_LABEL

router = APIRouter(tags=["stories"])

MAX_STORY_JOBS_PER_LESSON = 4  # konfirmasi identitas bisa butuh beberapa panggilan; cerita jadi maks 1

BASIS_NOTE = {
    "curated": "Kisah disusun dari sumber yang ditinjau tim.",
    "sourced": "Kisah disusun dari sumber web tepercaya; tautan sumber tercantum.",
    "user_hint": "Kisah disusun dari judul/seniman yang kamu isi; belum ada sumber yang menguatkan.",
    "ai_interpretation": "Kisah ini tafsiran AI, bukan fakta sejarah.",
}


CONFIDENCE_LABEL = {"high": "tinggi", "medium": "sedang", "low": "rendah"}


def basis_note(basis: str, identity: dict) -> str:
    """Catatan dasar kisah; untuk hasil agen riset disebut kandidat karya dan tingkat keyakinannya."""
    if identity.get("source") != "ai_research" or not identity.get("confidence"):
        return BASIS_NOTE[basis]
    name = " – ".join(v for v in (identity.get("title"), identity.get("artist")) if v) or identity.get("origin") or ""
    level = CONFIDENCE_LABEL.get(identity["confidence"], identity["confidence"])
    if basis == "sourced":
        return f"AI mengenali karya ini sebagai {name} lalu memeriksanya ke sumber web tepercaya (keyakinan {level}); tautan sumber tercantum."
    if name:
        return f"AI menduga karya ini {name} (keyakinan {level}), tetapi belum ada sumber yang menguatkan. Kisah ini tafsiran AI."
    return BASIS_NOTE[basis]


class StoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title_hint: str | None = Field(default=None, max_length=160)
    artist_hint: str | None = Field(default=None, max_length=120)
    origin_hint: str | None = Field(default=None, max_length=120)
    confirm_artwork_id: UUID | None = None
    interpretation_only: bool = False
    consent_ai_photo: bool = False


class StoryStartOut(BaseModel):
    story_id: UUID | None = None  # cerita sudah ada → langsung GET /stories/{id}
    job: JobOut | None = None  # sedang dibuat → polling GET /jobs/{id}


def _require_feature() -> None:
    if not get_settings().feature_story:
        raise AppError("feature_disabled", 404)


def _published_collection_story(lesson_id: str) -> str | None:
    rows = get_supabase().table("stories").select("id").eq("lesson_version_id", lesson_id).is_("session_id", "null").eq("review_status", "published").in_("status", ["ready", "text_only"]).limit(1).execute().data
    return rows[0]["id"] if rows else None


@router.post("/lessons/{lesson_id}/story", response_model=StoryStartOut)
def start_story(lesson_id: UUID, body: StoryRequest, response: Response, request: Request, key: str = Depends(idempotency_key)) -> StoryStartOut:
    _require_feature()
    db = get_supabase()
    rows = db.table("lesson_versions").select("id, origin, status, owner_session_id").eq("id", str(lesson_id)).limit(1).execute().data
    if not rows:
        raise AppError("not_found", 404)
    lesson = rows[0]

    if lesson["origin"] == "collection":
        if lesson["status"] != "published":
            raise AppError("not_found", 404)
        sid = _published_collection_story(lesson["id"])
        if not sid:
            raise AppError("story_not_available", 404)
        return StoryStartOut(story_id=sid)

    session = current_session(request)
    if session["id"] != lesson["owner_session_id"]:
        raise AppError("not_found", 404)

    existing = db.table("stories").select("id, status").eq("lesson_version_id", lesson["id"]).eq("session_id", session["id"]).in_("status", ["ready", "text_only", "generating"]).limit(1).execute().data
    if existing:
        return StoryStartOut(story_id=existing[0]["id"])

    if body.confirm_artwork_id:
        # Hanya artwork yang memang muncul sebagai kandidat pencocokan untuk sesi ini.
        recs = db.table("recognitions").select("id, candidates").eq("session_id", session["id"]).execute().data
        match = next((r for r in recs if any(c.get("artwork_id") == str(body.confirm_artwork_id) for c in r["candidates"] or [])), None)
        if not match:
            raise AppError("not_found", 404)
        lv = db.table("lesson_versions").select("id").eq("artwork_id", str(body.confirm_artwork_id)).eq("status", "published").order("version", desc=True).limit(1).execute().data
        sid = _published_collection_story(lv[0]["id"]) if lv else None
        if not sid:
            raise AppError("story_not_available", 404)
        db.table("recognitions").update({"confirmed_artwork_id": str(body.confirm_artwork_id)}).eq("id", match["id"]).execute()
        return StoryStartOut(story_id=sid)

    params = body.model_dump(mode="json", exclude={"confirm_artwork_id"})
    phash = payload_hash("generate_story", lesson["id"], *(str(params[k]) for k in sorted(params)))
    found = job_service.find_existing(session["id"], "generate_story", key, phash)
    if found:
        response.status_code = status.HTTP_202_ACCEPTED
        return StoryStartOut(job=to_job_out(found))
    n = db.table("jobs").select("id", count="exact").eq("session_id", session["id"]).eq("type", "generate_story").eq("lesson_version_id", lesson["id"]).neq("status", "failed").execute().count or 0
    if n >= MAX_STORY_JOBS_PER_LESSON:
        raise AppError("story_quota_exceeded", 429)
    job, _ = job_service.create_job(session["id"], "generate_story", key, phash, lesson_version_id=lesson["id"], params=params)
    response.status_code = status.HTTP_202_ACCEPTED
    return StoryStartOut(job=to_job_out(job))


# ---------------------------------------------------------------- baca cerita

class StorySource(BaseModel):
    url: str
    title: str
    domain: str


class StoryClaim(BaseModel):
    text: str
    type: str  # fakta | perkiraan
    source_urls: list[str]


class StoryCharacter(BaseModel):
    code: str
    name: str
    description: str
    region_codes: list[str]


class StoryPanelOut(BaseModel):
    order_no: int
    narration: str
    kind: str  # generated | artwork_crop | text
    status: str  # pending | ready | text_only
    image_url: str | None
    image_label: str | None  # "Ilustrasi AI" | "Potongan karya asli"
    purged: bool
    character_codes: list[str]
    focus_region_codes: list[str]


class StoryOut(BaseModel):
    id: UUID
    lesson_version_id: UUID
    status: str  # generating | ready | text_only | failed
    story_basis: str
    basis_label: str
    basis_note: str
    title: str | None
    summary: str | None
    identity: dict
    claims: list[StoryClaim]
    sources: list[StorySource]
    characters: list[StoryCharacter]
    panels: list[StoryPanelOut]


def _optional_session(request: Request) -> dict | None:
    try:
        return current_session(request)
    except AppError:
        return None


@router.get("/stories/{story_id}", response_model=StoryOut)
def get_story(story_id: UUID, request: Request) -> StoryOut:
    _require_feature()
    db = get_supabase()
    rows = db.table("stories").select("*, story_panels(*)").eq("id", str(story_id)).limit(1).execute().data
    if not rows:
        raise AppError("not_found", 404)
    s = rows[0]
    if s["session_id"] is None:
        if s["review_status"] != "published":
            raise AppError("not_found", 404)
    else:
        session = _optional_session(request)
        if session is None or session["id"] != s["session_id"]:
            raise AppError("not_found", 404)

    panels = sorted(s.get("story_panels") or [], key=lambda p: p["order_no"])
    urls: dict[str, str] = {}
    for bucket in {p["bucket"] for p in panels if p.get("bucket")}:
        paths = [p["asset_path"] for p in panels if p.get("bucket") == bucket and p.get("asset_path") and not p.get("purged_at")]
        urls.update(signed_urls(bucket, paths, CATALOG_URL_TTL if bucket == "catalog" else PRIVATE_URL_TTL))
    return StoryOut(
        id=s["id"],
        lesson_version_id=s["lesson_version_id"],
        status=s["status"],
        story_basis=s["story_basis"],
        basis_label=BASIS_LABEL[s["story_basis"]],
        basis_note=basis_note(s["story_basis"], s["identity"] or {}),
        title=s["title"],
        summary=s["summary"],
        identity={k: v for k, v in (s["identity"] or {}).items() if k in ("title", "artist", "origin", "confidence", "source", "reason")},
        claims=[StoryClaim(text=c["text"], type=c["type"], source_urls=c.get("source_urls") or []) for c in s["claims"] or []],
        sources=[StorySource(**x) for x in s["sources"] or []],
        characters=[StoryCharacter(**{k: c.get(k) for k in ("code", "name", "description", "region_codes")}) for c in s["characters"] or []],
        panels=[
            StoryPanelOut(
                order_no=p["order_no"],
                narration=p["narration"],
                kind=p["kind"],
                status=p["status"],
                image_url=None if p.get("purged_at") else urls.get(p.get("asset_path") or ""),
                image_label={"generated": "Ilustrasi AI", "artwork_crop": "Potongan karya asli"}.get(p["kind"]) if p["status"] == "ready" else None,
                purged=bool(p.get("purged_at")),
                character_codes=p["character_codes"] or [],
                focus_region_codes=p["focus_region_codes"] or [],
            )
            for p in panels
        ],
    )
