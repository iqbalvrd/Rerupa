"""Palet dan resep: GET /palettes (untuk layar Persiapan) dan GET /recipes/{id}."""

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from color.palettes import demo_palettes
from core.errors import AppError
from core.supabase_client import get_supabase

router = APIRouter(tags=["palettes"])


class PaintOut(BaseModel):
    id: UUID
    code: str
    name: str
    hex: str
    pigment_code: str | None


class PaletteOut(BaseModel):
    id: UUID
    name: str
    brand: str
    series: str
    paints: list[PaintOut]


class RecipeComponent(BaseModel):
    paint_id: UUID
    paint_code: str | None
    name: str | None
    hex: str | None
    parts: int


class RecipeOut(BaseModel):
    id: UUID
    palette_id: UUID
    kind: str  # tested | estimated
    label: str
    target_hex: str
    delta_e: float
    components: list[RecipeComponent]
    correction_tips: list | dict | None
    tested_at: str | None
    tested_by: str | None


@router.get("/palettes", response_model=list[PaletteOut])
def list_palettes() -> list[PaletteOut]:
    out = []
    for p in demo_palettes():
        paints = sorted(p["paints"], key=lambda x: x["code"])
        out.append(PaletteOut(id=p["id"], name=p["name"], brand=p["brand"], series=p["series"], paints=[PaintOut(**x) for x in paints]))
    return out


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: UUID) -> RecipeOut:
    db = get_supabase()
    rows = db.table("color_recipes").select("*").eq("id", str(recipe_id)).limit(1).execute().data
    if not rows:
        raise AppError("not_found", 404)
    r = rows[0]
    paints = {p["id"]: p for p in db.table("paints").select("id, code, name, hex").eq("palette_id", r["palette_id"]).execute().data}
    comps = []
    for c in r["components"]:
        p = paints.get(c["paint_id"], {})
        comps.append(RecipeComponent(paint_id=c["paint_id"], paint_code=p.get("code"), name=p.get("name"), hex=p.get("hex"), parts=int(c["parts"])))
    return RecipeOut(
        id=r["id"],
        palette_id=r["palette_id"],
        kind=r["kind"],
        label="Resep teruji" if r["kind"] == "tested" else "Perkiraan, uji sedikit dulu",
        target_hex=r["target_hex"],
        delta_e=float(r["delta_e"]),
        components=sorted(comps, key=lambda c: -c.parts),
        correction_tips=r.get("correction_tips"),
        tested_at=r.get("tested_at"),
        tested_by=r.get("tested_by"),
    )
