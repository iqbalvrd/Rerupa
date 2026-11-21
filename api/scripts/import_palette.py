"""Impor/perbarui palet dari content/palettes/<file>.json.

Jalankan dari folder api/:
    uv run --group cv python scripts/import_palette.py ../content/palettes/referensi_mixbox.json

Palet dicocokkan lewat (brand, series, name). Cat dicocokkan lewat code; nilai CIELAB dihitung dari hex.
Untuk palet cat fisik: hex diambil dari foto swatch kering yang dikalibrasi dengan kartu abu-abu.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from color.mixer import hex_to_lab  # noqa: E402
from core.supabase_client import get_supabase  # noqa: E402


def main() -> None:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    db = get_supabase()
    found = (
        db.table("palettes").select("id").eq("brand", data["brand"]).eq("series", data["series"]).eq("name", data["name"]).limit(1).execute().data
    )
    if found:
        palette_id = found[0]["id"]
        db.table("palettes").update({"is_demo": data.get("is_demo", False)}).eq("id", palette_id).execute()
    else:
        palette_id = db.table("palettes").insert(
            {"brand": data["brand"], "series": data["series"], "name": data["name"], "is_demo": data.get("is_demo", False)}
        ).execute().data[0]["id"]

    rows = []
    for p in data["paints"]:
        lab = [round(float(v), 2) for v in hex_to_lab(p["hex"])]
        rows.append({"palette_id": palette_id, "code": p["code"], "name": p["name"], "hex": p["hex"].upper(),
                     "lab": lab, "pigment_code": p.get("pigment_code"), "measured_at": p.get("measured_at"), "swatch_path": p.get("swatch_path")})
    db.table("paints").upsert(rows, on_conflict="palette_id,code").execute()
    print(json.dumps({"palette_id": palette_id, "paints": len(rows), "is_demo": data.get("is_demo", False)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
