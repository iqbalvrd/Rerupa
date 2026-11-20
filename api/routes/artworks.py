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
    lesson_version_id: UUID | None  # diisi di Fase 3 (lesson_versions belum ada)


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
    return [ArtworkCard(**_card_fields(r), thumbnail_url=urls.get(r["thumbnail_path"])) for r in rows]


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
        **_card_fields(r),
        thumbnail_url=urls.get(r["thumbnail_path"]),
        image_url=urls.get(r["image_path"]),
        adaptation_scope=r["adaptation_scope"],
        sources=sources,
    )


def _card_fields(r: dict) -> dict:
    return {
        "id": r["id"],
        "slug": r["slug"],
        "title": r["title"],
        "artist": r["artist"],
        "tradition": r["tradition"],
        "region_origin": r["region_origin"],
        "license": r["license"],
        "license_note": r["license_note"],
        "lesson_version_id": None,
    }
