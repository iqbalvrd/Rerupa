"""Tutorial: POST /lessons/generate (unggah foto → job latar) dan GET /lessons/{id}."""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from core.auth import CurrentUser, claim_session, current_user
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
    user: CurrentUser = Depends(current_user),
) -> JobOut:
    claim_session(session, user)
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
    mix_id: str | None = None  # v2: campuran untuk region ini
    grid_cells: list[str] = []  # v2: kotak grid yang disentuh region


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
    # v2 (structure_version 2); null/kosong pada lesson lama
    phase: str | None = None  # sketch | color | finishing
    new_lines: str | None = None  # lapisan yang garisnya baru di langkah ini
    grid_cells: list[str] = []
    mix_id: str | None = None


class PhaseOut(BaseModel):
    code: str
    title: str
    stage_codes: list[str]


class LandmarkOut(BaseModel):
    no: int
    x: int
    y: int
    grid_cell: str
    kind: str
    label: str | None = None


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


class MixOut(BaseModel):
    mix_id: str
    order_no: int
    name: str | None
    target_hex: str
    palette_id: UUID | None
    reachability: str | None
    label: str | None
    recipe_id: UUID | None
    components: list[ColorComponent]
    mixed_hex: str | None
    delta_e: float | None
    explanation: str | None
    tips: list[str]
    region_codes: list[str]
    max_region_delta_e: float | None


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
    region_colors: list[RegionColorOut]  # v1; kosong pada v2 (warna region = mixes[mix_id])
    # v2 (lihat API.md "Tutorial bertahap")
    structure_version: int = 1
    phases: list[PhaseOut] = []
    landmarks: list[LandmarkOut] = []
    mixes: list[MixOut] = []


PHASE_TITLES = {"sketch": "Sketsa", "color": "Warna", "finishing": "Finishing"}


def _optional_session(request: Request) -> dict | None:
    try:
        return current_session(request)
    except AppError:
        return None


# Query dijalankan paralel: tiap query adalah satu bolak-balik jaringan ke Supabase; berurutan ±11×.
_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix="lesson-read")
# Materi koleksi terbit tidak berubah per versi → respons di-cache (kunci: lesson + palet) sedikit lebih
# pendek dari masa berlaku signed URL katalog, supaya URL di respons cache tidak pernah kedaluwarsa.
_CACHE: dict[tuple[str, str | None], tuple[float, "LessonOut"]] = {}
_CACHE_TTL = CATALOG_URL_TTL - 600
_CACHE_MAX = 64
_DEMO_CACHE: tuple[float, str | None] | None = None


def _default_palette_id() -> str | None:
    """Palet demo pertama, di-cache 5 menit (berubah hanya saat palet diimpor)."""
    global _DEMO_CACHE
    from color.palettes import demo_palettes

    if _DEMO_CACHE is None or time.monotonic() - _DEMO_CACHE[0] > 300:
        demos = demo_palettes()
        _DEMO_CACHE = (time.monotonic(), demos[0]["id"] if demos else None)
    return _DEMO_CACHE[1]


def clear_lesson_cache() -> None:
    global _DEMO_CACHE
    _CACHE.clear()
    _DEMO_CACHE = None


@router.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: UUID, request: Request, palette_id: UUID | None = Query(None, description="Palet untuk saran warna; bawaan: palet sesi, lalu palet demo pertama")) -> LessonOut:
    db = get_supabase()
    f_lesson = _POOL.submit(lambda: db.table("lesson_versions").select("*").eq("id", str(lesson_id)).limit(1).execute().data)
    f_session = _POOL.submit(_optional_session, request)
    rows, session = f_lesson.result(), f_session.result()
    if not rows:
        raise AppError("not_found", 404)
    lesson = rows[0]

    # Akses: koleksi hanya bila terbit; mode bebas hanya untuk sesi pemiliknya. Selain itu 404.
    if lesson["origin"] == "collection":
        if lesson["status"] != "published":
            raise AppError("not_found", 404)
    elif session is None or session["id"] != lesson["owner_session_id"]:
        raise AppError("not_found", 404)

    lid = lesson["id"]
    pid = str(palette_id) if palette_id else (session or {}).get("palette_id") or _default_palette_id()
    cacheable = lesson["origin"] == "collection"
    if cacheable:
        hit = _CACHE.get((lid, pid))
        if hit and time.monotonic() - hit[0] < _CACHE_TTL:
            return hit[1]

    v2 = (lesson.get("structure_version") or 1) == 2
    region_cols = "id, code, hex, area_pct, bbox, centroid, is_main_object, is_background, value_level, label" + (", mix_id, grid_cells" if v2 else "")
    q = {
        "layers": lambda: db.table("visual_layers").select("kind, bucket, asset_path, format, meta, purged_at").eq("lesson_version_id", lid).execute().data,
        "regions": lambda: db.table("regions").select(region_cols).eq("lesson_version_id", lid).order("code").execute().data,
        "stages": lambda: db.table("stages").select("*, stage_regions(regions(code))").eq("lesson_version_id", lid).order("order_no").execute().data,
        "claims": lambda: db.table("culture_claims").select("text, type, order_no, stage_id, culture_claim_sources(sources(code, title, url))").eq("lesson_version_id", lid).order("order_no").execute().data,
        "refl": lambda: db.table("reflection_questions").select("question, options, correct_option, sources(code, title, url)").eq("lesson_version_id", lid).limit(1).execute().data,
        "colors": lambda: [] if v2 else _color_rows(db, lid, pid),
        # Tabel v2 hanya dibaca untuk lesson v2: DB tanpa migrasi tutorial bertahap tetap aman.
        "mixes": lambda: db.table("lesson_mixes").select("mix_id, order_no, name, target_hex, max_region_delta_e").eq("lesson_version_id", lid).order("order_no").execute().data if v2 else [],
        "mix_colors": lambda: _mix_color_rows(db, lid, pid) if v2 else [],
        "paints": lambda: db.table("paints").select("id, code, name, hex").eq("palette_id", pid).execute().data if pid else [],
    }
    futures = {k: _POOL.submit(f) for k, f in q.items()}
    r = {k: f.result() for k, f in futures.items()}
    layers, regions, stages, claims, refl = r["layers"], r["regions"], r["stages"], r["claims"], r["refl"]

    by_bucket: dict[str, list[str]] = {}
    for l in layers:
        if not l["purged_at"]:
            by_bucket.setdefault(l["bucket"], []).append(l["asset_path"])
    url_futures = [_POOL.submit(signed_urls, b, paths, CATALOG_URL_TTL if b == "catalog" else PRIVATE_URL_TTL) for b, paths in by_bucket.items()]
    urls: dict[str, str] = {}
    for f in url_futures:
        urls.update(f.result())

    stage_code_by_id = {s["id"]: s["code"] for s in stages}
    out = LessonOut(
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
        regions=[RegionOut(**{k: x[k] for k in RegionOut.model_fields if k in x}) for x in regions],
        stages=[
            StageOut(
                **{k: s[k] for k in ("code", "order_no", "kind", "is_checkpoint", "layers", "title", "action", "tools", "done_when", "common_mistakes", "focus_bbox", "text_source")},
                phase=s.get("phase"),
                new_lines=s.get("new_lines"),
                grid_cells=s.get("grid_cells") or [],
                mix_id=s.get("mix_id"),
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
        palette_id=pid,
        region_colors=_region_colors(r["colors"], r["paints"]),
        structure_version=lesson.get("structure_version") or 1,
        phases=_phases(stages),
        landmarks=[LandmarkOut(**m) for m in lesson.get("landmarks") or []],
        mixes=_mixes(r["mixes"], r["mix_colors"], r["paints"], regions),
    )
    if cacheable:
        if len(_CACHE) >= _CACHE_MAX:
            _CACHE.pop(min(_CACHE, key=lambda k: _CACHE[k][0]))
        _CACHE[(lid, pid)] = (time.monotonic(), out)
    return out


def _phases(stages: list[dict]) -> list[PhaseOut]:
    """Fase urut tampil (Sketsa, Warna, Finishing) dari stages[].phase; kosong pada lesson lama."""
    out = []
    for code, title in PHASE_TITLES.items():
        codes = [s["code"] for s in stages if s.get("phase") == code]
        if codes:
            out.append(PhaseOut(code=code, title=title, stage_codes=codes))
    return out


def _mix_color_rows(db, lesson_id: str, pid: str | None) -> list[dict]:
    if not pid:
        return []
    return (
        db.table("mix_colors")
        .select("mix_id, palette_id, recipe_id, estimate, reachability, explanation, color_recipes(target_hex, delta_e, components)")
        .eq("lesson_version_id", lesson_id)
        .eq("palette_id", pid)
        .execute()
        .data
    )


def _components(raw: list[dict], paints: dict[str, dict]) -> list[ColorComponent]:
    comps = [
        ColorComponent(paint_code=paints[c["paint_id"]]["code"], name=paints[c["paint_id"]]["name"], hex=paints[c["paint_id"]]["hex"], parts=int(c["parts"]))
        for c in raw
        if c.get("paint_id") in paints
    ]
    return sorted(comps, key=lambda c: -c.parts)


def _mixes(mix_rows: list[dict], color_rows: list[dict], paint_rows: list[dict], regions: list[dict]) -> list[MixOut]:
    """Kartu campuran v2 untuk satu palet. Angka dari mixer/uji fisik, bukan AI."""
    paints = {p["id"]: p for p in paint_rows}
    colors = {c["mix_id"]: c for c in color_rows}
    out = []
    for m in mix_rows:
        c = colors.get(m["mix_id"]) or {}
        est = c.get("estimate") or {}
        rec = c.get("color_recipes") or {}
        reach = c.get("reachability")
        out.append(MixOut(
            mix_id=m["mix_id"],
            order_no=m["order_no"],
            name=m["name"],
            target_hex=m["target_hex"],
            palette_id=c.get("palette_id"),
            reachability=reach,
            label=REACH_LABEL.get(reach) if reach else None,
            recipe_id=c.get("recipe_id"),
            components=_components(est.get("components") or rec.get("components") or [], paints),
            mixed_hex=est.get("mixed_hex") or rec.get("target_hex"),
            delta_e=est.get("delta_e", rec.get("delta_e")),
            explanation=c.get("explanation"),
            tips=est.get("tips") or [],
            region_codes=sorted(r["code"] for r in regions if r.get("mix_id") == m["mix_id"]),
            max_region_delta_e=m["max_region_delta_e"],
        ))
    return out


def _color_rows(db, lesson_id: str, pid: str | None) -> list[dict]:
    if not pid:
        return []
    return (
        db.table("region_colors")
        .select("palette_id, recipe_id, estimate, reachability, explanation, regions!inner(code, lesson_version_id), color_recipes(target_hex, delta_e, components)")
        .eq("palette_id", pid)
        .eq("regions.lesson_version_id", lesson_id)
        .execute()
        .data
    )


def _region_colors(rows: list[dict], paint_rows: list[dict]) -> list[RegionColorOut]:
    """Saran warna tiap region untuk satu palet. Angka berasal dari mixer/uji fisik, bukan AI."""
    paints = {p["id"]: p for p in paint_rows}
    out = []
    for row in rows:
        est = row.get("estimate") or {}
        rec = row.get("color_recipes") or {}
        comps = _components(est.get("components") or rec.get("components") or [], paints)
        out.append(
            RegionColorOut(
                region_code=row["regions"]["code"],
                palette_id=row["palette_id"],
                reachability=row["reachability"],
                label=REACH_LABEL[row["reachability"]],
                recipe_id=row["recipe_id"],
                components=comps,
                mixed_hex=est.get("mixed_hex") or rec.get("target_hex"),
                delta_e=est.get("delta_e", rec.get("delta_e")),
                explanation=row["explanation"],
                tips=est.get("tips") or [],
            )
        )
    return sorted(out, key=lambda c: c.region_code)
