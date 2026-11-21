"""Tutorial: POST /lessons/generate (unggah foto → job latar) dan GET /lessons/{id}."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from core.config import get_settings
from core.errors import AppError
from core.idempotency import idempotency_key
from core.security import payload_hash, sha256_hex
from core.session import current_session, now_utc
from core.supabase_client import get_supabase
from routes.jobs import JobOut, to_job_out
from services import jobs as job_service
from services.storage import CATALOG_URL_TTL, PRIVATE_URL_TTL, signed_urls
from services.uploads import clean_image, discard_upload, read_limited, store_upload

router = APIRouter(prefix="/lessons", tags=["lessons"])

CONSENT_TEXT_VERSION = "v1"


class Scope(BaseModel):
    """Area latihan (potong satu figur) dalam pecahan 0–1 dari lebar/tinggi foto."""

    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0.05, le=1)
    h: float = Field(gt=0.05, le=1)

    @model_validator(mode="after")
    def inside(self):
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("cakupan keluar dari foto")
        return self


def _parse_scope(raw: str | None) -> dict | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        return Scope(**json.loads(raw)).model_dump()
    except (ValueError, TypeError, ValidationError):
        raise AppError("validation_error", 422) from None


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED, response_model=JobOut)
def generate_lesson(
    file: UploadFile = File(..., description="Foto karya: JPEG/PNG/WebP, maks 10 MB"),
    consent_ai_photo: bool = Form(..., description="Pengguna setuju foto dikirim ke penyedia AI"),
    scope: str | None = Form(None, description='Opsional, JSON {"x","y","w","h"} pecahan 0–1: area satu figur'),
    key: str = Depends(idempotency_key),
    session: dict = Depends(current_session),
) -> JobOut:
    settings = get_settings()
    scope_obj = _parse_scope(scope)
    original = read_limited(file.file, settings.max_upload_bytes)
    phash = payload_hash("generate_lesson", sha256_hex(original), str(consent_ai_photo), json.dumps(scope_obj, sort_keys=True))

    # Permintaan ulang (klik ganda, retry jaringan) → job yang sama, tanpa unggah atau biaya ganda.
    existing = job_service.find_existing(session["id"], "generate_lesson", key, phash)
    if existing:
        return to_job_out(existing)

    if job_service.count_jobs(session["id"], "generate_lesson") >= settings.generate_quota_per_session:
        raise AppError("quota_exceeded", 429)

    clean = clean_image(original)
    upload = store_upload(session["id"], original, clean, purpose="reference")

    job, created = job_service.create_job(
        session["id"],
        "generate_lesson",
        key,
        phash,
        upload_id=upload["id"],
        params={"consent_ai_photo": consent_ai_photo, "scope": scope_obj},
    )
    if not created:
        discard_upload(upload)

    get_supabase().table("practice_sessions").update(
        {"consent": {"ai_photo": consent_ai_photo, "at": now_utc().isoformat(), "text_version": CONSENT_TEXT_VERSION}}
    ).eq("id", session["id"]).execute()

    return to_job_out(job)


# ---------------------------------------------------------------- GET /lessons/{id}

class LayerOut(BaseModel):
    kind: str
    format: str
    url: str | None  # null bila file sudah dihapus (retensi 24 jam foto & turunannya)
    meta: dict
    purged: bool = False


class RegionOut(BaseModel):
    code: str
    hex: str
    area_pct: float
    bbox: list[int]
    centroid: list[int]
    is_main_object: bool
    is_background: bool
    value_level: int | None
    label: str | None


class StageOut(BaseModel):
    code: str
    order_no: int
    kind: str
    is_checkpoint: bool
    layers: list[str]
    new_region_codes: list[str]
    title: str
    action: str
    tools: list[str]
    done_when: str
    common_mistakes: list[str]
    focus_bbox: list[int] | None
    text_source: str


class SourceRef(BaseModel):
    code: str
    title: str
    url: str | None


class ClaimOut(BaseModel):
    stage_code: str | None
    text: str
    type: str  # fakta | perkiraan
    sources: list[SourceRef]


class ReflectionOut(BaseModel):
    question: str
    options: list[str]
    correct_option: int
    source: SourceRef | None


class ColorComponent(BaseModel):
    paint_code: str
    name: str
    hex: str
    parts: int


class RegionColorOut(BaseModel):
    region_code: str
    palette_id: UUID
    reachability: str  # recipe | estimate | hard
    label: str
    recipe_id: UUID | None
    components: list[ColorComponent]
    mixed_hex: str | None
    delta_e: float | None
    explanation: str | None
    tips: list[str]


REACH_LABEL = {"recipe": "Resep teruji", "estimate": "Perkiraan, uji sedikit dulu", "hard": "Sulit dicapai dengan palet ini"}


class LessonOut(BaseModel):
    id: UUID
    origin: str
    artwork_id: UUID | None
    image_width: int
    image_height: int
    use_shading: bool
    checkpoint_count: int
    ai_text_status: str
    generated_automatically: bool
    skill_goal: str | None
    culture_goal: str | None
    layers: list[LayerOut]
    regions: list[RegionOut]
    stages: list[StageOut]
    culture_claims: list[ClaimOut]
    reflection: ReflectionOut | None
    palette_id: UUID | None
    region_colors: list[RegionColorOut]


def _optional_session(request: Request) -> dict | None:
    try:
        return current_session(request)
    except AppError:
        return None


@router.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: UUID, request: Request, palette_id: UUID | None = Query(None, description="Palet untuk saran warna; bawaan: palet sesi, lalu palet demo pertama")) -> LessonOut:
    db = get_supabase()
    rows = db.table("lesson_versions").select("*").eq("id", str(lesson_id)).limit(1).execute().data
    if not rows:
        raise AppError("not_found", 404)
    lesson = rows[0]

    # Akses: koleksi hanya bila terbit; mode bebas hanya untuk sesi pemiliknya. Selain itu 404.
    session = _optional_session(request)
    if lesson["origin"] == "collection":
        if lesson["status"] != "published":
            raise AppError("not_found", 404)
    elif session is None or session["id"] != lesson["owner_session_id"]:
        raise AppError("not_found", 404)

    lid = lesson["id"]
    layers = db.table("visual_layers").select("kind, bucket, asset_path, format, meta, purged_at").eq("lesson_version_id", lid).execute().data
    regions = db.table("regions").select("id, code, hex, area_pct, bbox, centroid, is_main_object, is_background, value_level, label").eq("lesson_version_id", lid).order("code").execute().data
    stages = db.table("stages").select("*, stage_regions(regions(code))").eq("lesson_version_id", lid).order("order_no").execute().data
    claims = db.table("culture_claims").select("text, type, order_no, stage_id, culture_claim_sources(sources(code, title, url))").eq("lesson_version_id", lid).order("order_no").execute().data
    refl = db.table("reflection_questions").select("question, options, correct_option, sources(code, title, url)").eq("lesson_version_id", lid).limit(1).execute().data

    urls: dict[str, str] = {}
    for bucket in {layer["bucket"] for layer in layers}:
        ttl = CATALOG_URL_TTL if bucket == "catalog" else PRIVATE_URL_TTL
        urls.update(signed_urls(bucket, [l["asset_path"] for l in layers if l["bucket"] == bucket and not l["purged_at"]], ttl))

    stage_code_by_id = {s["id"]: s["code"] for s in stages}
    return LessonOut(
        id=lid,
        origin=lesson["origin"],
        artwork_id=lesson["artwork_id"],
        image_width=lesson["image_width"],
        image_height=lesson["image_height"],
        use_shading=lesson["use_shading"],
        checkpoint_count=lesson["checkpoint_count"],
        ai_text_status=lesson["ai_text_status"],
        generated_automatically=lesson["origin"] == "free_mode",
        skill_goal=lesson["skill_goal"],
        culture_goal=lesson["culture_goal"],
        layers=[
            LayerOut(kind=l["kind"], format=l["format"], url=None if l["purged_at"] else urls.get(l["asset_path"]), meta=l["meta"], purged=bool(l["purged_at"]))
            for l in layers
        ],
        regions=[RegionOut(**{k: r[k] for k in RegionOut.model_fields}) for r in regions],
        stages=[
            StageOut(
                **{k: s[k] for k in ("code", "order_no", "kind", "is_checkpoint", "layers", "title", "action", "tools", "done_when", "common_mistakes", "focus_bbox", "text_source")},
                new_region_codes=sorted(sr["regions"]["code"] for sr in s.get("stage_regions") or [] if sr.get("regions")),
            )
            for s in stages
        ],
        culture_claims=[
            ClaimOut(
                stage_code=stage_code_by_id.get(c["stage_id"]),
                text=c["text"],
                type=c["type"],
                sources=[SourceRef(**link["sources"]) for link in c.get("culture_claim_sources") or [] if link.get("sources")],
            )
            for c in claims
        ],
        reflection=(
            ReflectionOut(
                question=refl[0]["question"],
                options=refl[0]["options"],
                correct_option=refl[0]["correct_option"],
                source=SourceRef(**refl[0]["sources"]) if refl[0].get("sources") else None,
            )
            if refl
            else None
        ),
        **_colors(db, regions, palette_id, session),
    )


def _colors(db, regions: list[dict], palette_id: UUID | None, session: dict | None) -> dict:
    """Saran warna tiap region untuk satu palet. Angka berasal dari mixer/uji fisik, bukan AI."""
    from color.palettes import demo_palettes

    pid = str(palette_id) if palette_id else (session or {}).get("palette_id")
    if pid is None:
        demos = demo_palettes()
        pid = demos[0]["id"] if demos else None
    if pid is None or not regions:
        return {"palette_id": pid, "region_colors": []}

    code_of = {r["id"]: r["code"] for r in regions}
    rows = (
        db.table("region_colors")
        .select("region_id, palette_id, recipe_id, estimate, reachability, explanation, color_recipes(target_hex, delta_e, components)")
        .eq("palette_id", pid)
        .in_("region_id", list(code_of))
        .execute()
        .data
    )
    paints = {p["id"]: p for p in db.table("paints").select("id, code, name, hex").eq("palette_id", pid).execute().data}

    out = []
    for row in rows:
        est = row.get("estimate") or {}
        rec = row.get("color_recipes") or {}
        raw = est.get("components") or rec.get("components") or []
        comps = [
            ColorComponent(paint_code=paints[c["paint_id"]]["code"], name=paints[c["paint_id"]]["name"], hex=paints[c["paint_id"]]["hex"], parts=int(c["parts"]))
            for c in raw
            if c.get("paint_id") in paints
        ]
        out.append(
            RegionColorOut(
                region_code=code_of[row["region_id"]],
                palette_id=row["palette_id"],
                reachability=row["reachability"],
                label=REACH_LABEL[row["reachability"]],
                recipe_id=row["recipe_id"],
                components=sorted(comps, key=lambda c: -c.parts),
                mixed_hex=est.get("mixed_hex") or rec.get("target_hex"),
                delta_e=est.get("delta_e", rec.get("delta_e")),
                explanation=row["explanation"],
                tips=est.get("tips") or [],
            )
        )
    return {"palette_id": pid, "region_colors": sorted(out, key=lambda c: c.region_code)}
