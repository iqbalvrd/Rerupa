"""Kalibrasi pencocokan foto → materi koleksi (story/recognize.py).

Dari folder api/:  uv run --group cv python ../eval/run_recognition.py [--out ../eval/HASIL_PENGENALAN.md]

Referensi: semua materi di content/artworks/. Kueri: tiap materi "difoto" HP secara sintetis (miring,
derau, cahaya tidak rata) dalam 3 bentuk: utuh, hanya area latihan (scope), dan utuh tapi buram. Ditambah
gambar yang BUKAN koleksi (figur sintetis, lukisan sintetis kain) sebagai negatif.
Harapan: kueri cocok dengan materinya sendiri di atas ambang, dan tidak ada yang lain melewati ambang.
"""

import argparse
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "api"), str(ROOT / "api" / "tests")]

import warnings  # noqa: E402

warnings.filterwarnings("ignore")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import checkpoint_synth as S  # noqa: E402
from cv.normalize import decode_rgb, encode_jpeg  # noqa: E402
from story import recognize as rec  # noqa: E402


def load() -> list[tuple[dict, bytes]]:
    out = []
    for folder in sorted((ROOT / "content" / "artworks").iterdir()):
        meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        out.append(({"id": meta["slug"], "slug": meta["slug"], "title": meta["title"], "artist": meta.get("artist"), "scope": meta.get("scope")}, (folder / meta["image"]).read_bytes()))
    return out


def photo_of(rgb: np.ndarray, blur: float = 0.8) -> bytes:
    small = Image.fromarray(rgb)
    small.thumbnail((1600, 1600))
    photo, _ = S.photograph_any(np.asarray(small), blur=blur)
    return encode_jpeg(photo, 88)


def crop(rgb: np.ndarray, scope: dict | None) -> np.ndarray:
    if not scope:
        h, w = rgb.shape[:2]
        return rgb[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4]
    h, w = rgb.shape[:2]
    return rgb[int(scope["y"] * h) : int((scope["y"] + scope["h"]) * h), int(scope["x"] * w) : int((scope["x"] + scope["w"]) * w)]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    args = ap.parse_args()
    items = load()
    refs = [r for a, data in items for r in rec.references_for(a, data, a["scope"])]
    queries = []
    for a, data in items:
        rgb = decode_rgb(data)
        queries += [(f"{a['slug']} · utuh", a["slug"], photo_of(rgb)), (f"{a['slug']} · area latihan", a["slug"], photo_of(crop(rgb, a["scope"]))), (f"{a['slug']} · buram", a["slug"], photo_of(rgb, blur=3.0))]
    from test_cv import figure_image

    queries.append(("bukan koleksi · figur sintetis", None, photo_of(figure_image())))
    paper = S.drawing(paint=True)
    queries.append(("bukan koleksi · lukisan sintetis", None, photo_of(paper)))
    noise = (np.random.default_rng(1).random((900, 1200, 3)) * 255).astype(np.uint8)
    queries.append(("bukan koleksi · derau", None, photo_of(cv2.GaussianBlur(noise, (0, 0), 2))))

    lines = ["| Kueri | Harapan | Skor tertinggi (benar) | Skor tertinggi lain | Hasil |", "| --- | --- | --- | --- | --- |"]
    ok = 0
    worst_pos, worst_neg = 10**9, 0
    for name, expect, photo in queries:
        q = rec.features(decode_rgb(photo))
        scores: dict[str, int] = {}
        for r in refs:
            scores[r.slug] = max(scores.get(r.slug, 0), rec.score(q, r)["inliers"])
        right = scores.get(expect, 0) if expect else 0
        other = max((v for k, v in scores.items() if k != expect), default=0)
        match = rec.best_match(photo, refs)
        got = match["slug"] if match else None
        good = got == expect
        ok += good
        if expect:
            worst_pos = min(worst_pos, right)
        worst_neg = max(worst_neg, other)
        lines.append(f"| {name} | {expect or '–'} | {right if expect else '–'} | {other} | {'✅' if good else '❌'} {got or 'tidak cocok'} |")
        print(lines[-1], flush=True)
    lines.append(f"\nSesuai harapan: {ok}/{len(queries)} · skor benar terendah {worst_pos} · skor salah tertinggi {worst_neg} · ambang MIN_INLIERS={rec.MIN_INLIERS}")
    print(lines[-1])
    if args.out:
        Path(args.out).write_text("# Kalibrasi pencocokan foto → koleksi\n\n" + "\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
