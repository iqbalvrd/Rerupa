"""Galeri materi koleksi: GET /artworks dan GET /artworks/{slug}. Hanya karya berstatus published."""

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from core.errors import AppError
from core.supabase_client import get_supabase
from services.storage import CATALOG_URL_TTL, signed_urls

router = APIRouter(prefix="/artworks", tags=["artworks"])

LIST_COLUMNS = "id, slug, title, artist, tradition, region_origin, license, license_note, thumbnail_path"


class SourceOut(BaseModel):
    code: str
    title: str
    publisher: str | None
    url: str | None
    claim_note: str | None


class ArtworkCard(BaseModel):
    id: UUID
    slug: str
    title: str
    artist: str | None  # null = tidak diketahui (tidak ditebak)
    tradition: str | None
    region_origin: str | None
    license: str
    license_note: str | None
    thumbnail_url: str | None
    lesson_version_id: UUID | None  # versi lesson terbit terbaru; kirim ke POST/PATCH /sessions untuk mulai latihan


class ArtworkDetail(ArtworkCard):
    image_url: str | None
    adaptation_scope: str | None
    sources: list[SourceOut]


@router.get("", response_model=list[ArtworkCard])
def list_artworks() -> list[ArtworkCard]:
    rows = (
        get_supabase()
        .table("artworks")
        .select(LIST_COLUMNS)
        .eq("status", "published")
        .order("title")
        .execute()
        .data
    )
    urls = signed_urls("catalog", [r["thumbnail_path"] for r in rows], CATALOG_URL_TTL)
    lessons = _published_lessons([r["id"] for r in rows])
    return [ArtworkCard(**_card_fields(r, lessons), thumbnail_url=urls.get(r["thumbnail_path"])) for r in rows]


@router.get("/{slug}", response_model=ArtworkDetail)
def get_artwork(slug: str) -> ArtworkDetail:
    rows = (
        get_supabase()
        .table("artworks")
        .select(LIST_COLUMNS + ", image_path, adaptation_scope, artwork_sources(claim_note, sources(code, title, publisher, url))")
        .eq("slug", slug)
        .eq("status", "published")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise AppError("not_found", 404)
    r = rows[0]
    urls = signed_urls("catalog", [r["thumbnail_path"], r["image_path"]], CATALOG_URL_TTL)
    sources = [
        SourceOut(claim_note=link["claim_note"], **link["sources"])
        for link in r.get("artwork_sources") or []
        if link.get("sources")
    ]
    return ArtworkDetail(
        **_card_fields(r, _published_lessons([r["id"]])),
        thumbnail_url=urls.get(r["thumbnail_path"]),
        image_url=urls.get(r["image_path"]),
        adaptation_scope=r["adaptation_scope"],
        sources=sources,
    )


def _published_lessons(artwork_ids: list[str]) -> dict[str, str]:
    """artwork_id → id lesson terbit dengan versi tertinggi."""
    if not artwork_ids:
        return {}
    rows = (
        get_supabase()
        .table("lesson_versions")
        .select("id, artwork_id, version")
        .in_("artwork_id", artwork_ids)
        .eq("status", "published")
        .order("version", desc=True)
        .execute()
        .data
    )
    out: dict[str, str] = {}
    for row in rows:
        out.setdefault(row["artwork_id"], row["id"])
    return out


def _card_fields(r: dict, lessons: dict[str, str]) -> dict:
    return {
        "id": r["id"],
        "slug": r["slug"],
        "title": r["title"],
        "artist": r["artist"],
        "tradition": r["tradition"],
        "region_origin": r["region_origin"],
        "license": r["license"],
        "license_note": r["license_note"],
        "lesson_version_id": lessons.get(r["id"]),
    }
