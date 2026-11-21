"""Uji deteksi kesalahan sketsa pada tutorial NYATA (materi koleksi), dengan foto progres sintetis.

Dari folder api/:  uv run --group cv python ../eval/run_checkpoint_shift.py [--out ../eval/HASIL_CHECKPOINT_NYATA.md]

Untuk tiap materi: sketsa digambar ulang dari sketch.svg tutorial (grid + garis), lalu digeser/diubah
dan difoto miring. Yang diharapkan:
- tanpa perubahan      → tidak ada saran (tidak boleh ada "kesalahan palsu")
- geser seluruh sketsa → saran "seluruh sketsa bergeser" dengan arah yang benar
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "api"), str(ROOT / "api" / "tests")]

import warnings  # noqa: E402

warnings.filterwarnings("ignore")

import checkpoint_synth as S  # noqa: E402
from cv import checkpoint as cp  # noqa: E402
from cv import pipeline  # noqa: E402
from cv.compare import TargetRegion  # noqa: E402
from cv.normalize import encode_jpeg  # noqa: E402
from services.lessons import grid_svg  # noqa: E402

ARTWORKS = ["raden-saleh-penangkapan-diponegoro", "lukisan-kain-bali-goteborg", "batik-sarung-buketan-cooper-hewitt", "mas-pirngadie-sawah-berundak"]
# nama kasus → (dx, dy) dalam pecahan lebar/tinggi, arah yang diharapkan (None = tidak ada saran)
CASES = {
    "sesuai": ((0, 0), None),
    "geser kanan 4%": ((0.04, 0), "kanan"),
    "geser kanan 8%": ((0.08, 0), "kanan"),
    "geser bawah 6%": ((0, 0.06), "bawah"),
    "geser kiri-atas 5%": ((-0.05, -0.05), "kiri atas"),
}


def target_for(slug: str):
    folder = ROOT / "content" / "artworks" / slug
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    cv = pipeline.run((folder / meta["image"]).read_bytes(), scope=meta.get("scope"), canvas_size="A4", lineart_method="xdog", mask_model="u2net", use_shading=meta.get("use_shading"))
    _, g = grid_svg(cv.width, cv.height)
    grid = (g["cols"], g["rows"])
    t = cp.TargetLesson(cv.width, cv.height, cv.regions_svg, cv.sketch_svg, cv.main_object_svg,
                        [TargetRegion(r.code, r.hex, r.area_pct, r.is_background, r.is_main_object) for r in cv.regions], grid)
    return cv, t, grid


def verdict(res, expect) -> tuple[bool, str]:
    shifted = [c for c in res.candidates if c["kind"] == "shifted" and c["region_code"] == "sketch"]
    desc = ", ".join(f"{c['region_code']}:{c['kind']}{'(' + c['facts'].get('direction', '') + ')' if c['kind'] == 'shifted' else ''}" for c in res.candidates) or "–"
    if res.needs_retake:
        return False, f"foto ulang ({res.retake_code})"
    if expect is None:
        return not res.candidates, desc
    return bool(shifted) and shifted[0]["facts"]["direction"] == expect and res.candidates[0] is shifted[0], desc


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    args = ap.parse_args()
    lines = ["| Materi | Kasus | Hasil | Kandidat (urut) |", "| --- | --- | --- | --- |"]
    ok_total = 0
    for slug in ARTWORKS:
        cv, target, grid = target_for(slug)
        for name, ((fx, fy), expect) in CASES.items():
            paper = S.drawing_from_svg(cv.sketch_svg, cv.width, cv.height, grid, shift=(round(fx * cv.width), round(fy * cv.height)))
            photo, corners = S.photograph_any(paper, seed=hash(name) % 100)
            res = cp.run(encode_jpeg(photo, 92), corners, target, "sketch", set())
            ok, desc = verdict(res, expect)
            ok_total += ok
            lines.append(f"| {slug} | {name} | {'✅' if ok else '❌'} | {desc} |")
            print(lines[-1], flush=True)
    lines.append(f"\nSesuai harapan: {ok_total}/{len(ARTWORKS) * len(CASES)}")
    text = "\n".join(lines)
    print(text.splitlines()[-1])
    if args.out:
        Path(args.out).write_text("# Checkpoint pada tutorial nyata (foto progres sintetis)\n\n" + text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
