"""Membaca palet dari database dan menghitung saran warna untuk semua region sebuah tutorial."""

from typing import TYPE_CHECKING

from core.supabase_client import get_supabase

if TYPE_CHECKING:
    from color.mixer import Paint
    from cv.types import Region

# color.mixer (Mixbox + colour-science + scipy) diimpor di dalam fungsi: API hanya membaca daftar
# palet dari DB, jadi tidak perlu memuat pustaka hitung warna (start API 7,3 s → ±3 s).


def demo_palettes() -> list[dict]:
    """Palet yang bisa dipilih pengguna (is_demo = true), beserta catnya."""
    return (
        get_supabase()
        .table("palettes")
        .select("id, brand, series, name, is_demo, paints(id, code, name, hex, pigment_code)")
        .eq("is_demo", True)
        .order("created_at")
        .execute()
        .data
    )


def paints_of(palette: dict) -> "tuple[Paint, ...]":
    from color.mixer import Paint

    return tuple(sorted((Paint(p["id"], p["code"], p["name"], p["hex"].upper()) for p in palette["paints"]), key=lambda p: p.code))


def tested_recipes(palette_id: str) -> list[dict]:
    return (
        get_supabase()
        .table("color_recipes")
        .select("id, target_hex, target_lab, components")
        .eq("palette_id", palette_id)
        .eq("kind", "tested")
        .execute()
        .data
    )


def region_colors_for(regions: "list[Region]") -> list[dict]:
    """Saran warna tiap region untuk tiap palet demo → baris untuk create_lesson."""
    from color.mixer import best_mix, mix_table

    rows = []
    for palette in demo_palettes():
        paints = paints_of(palette)
        if not paints:
            continue
        table = mix_table(paints)
        tested = tested_recipes(palette["id"])
        for r in regions:
            mix = best_mix(r.hex, table, tested)
            rows.append(
                {
                    "region_code": r.code,
                    "palette_id": palette["id"],
                    "recipe_id": mix.recipe_id,
                    "estimate": None if mix.recipe_id else mix.estimate_json(),
                    "reachability": mix.reachability,
                    "explanation": mix.explanation,
                }
            )
    return rows
