"""Evaluasi pipeline CV pada foto nyata (PLAN_IQBAL Fase 2).

Jalankan dari folder api/:
    uv run --group cv python ../eval/run_cv.py            # semua foto di eval/photos/
    uv run --group cv python ../eval/run_cv.py --quick    # tanpa model (xdog/canny saja)

Untuk tiap foto:
- Membandingkan garis: model (Informative Drawings), teed, xdog, canny
- Membandingkan mask: isnet-general-use vs u2net
- Region, terang-gelap, gambar bernomor
- Waktu tiap langkah dan RAM puncak proses
Hasil: eval/out/<foto>/*.png, eval/out/<foto>/report.json, eval/out/summary.md
"""

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import psutil

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "api"))

from cv import lineart, normalize, quality, render, value  # noqa: E402
from cv.mask import main_object_mask  # noqa: E402
from cv.regions import segment  # noqa: E402

PHOTOS = ROOT / "photos"
OUT = ROOT / "out"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
PROC = psutil.Process()


class Peak:
    def __init__(self) -> None:
        self.mb = PROC.memory_info().rss / 1e6

    def sample(self) -> None:
        self.mb = max(self.mb, PROC.memory_info().rss / 1e6)


def timed(fn, peak: Peak):
    start = time.perf_counter()
    out = fn()
    peak.sample()
    return out, int((time.perf_counter() - start) * 1000)


def overlay_lines(img: np.ndarray, binary: np.ndarray) -> np.ndarray:
    faded = (img * 0.35 + 255 * 0.65).astype(np.uint8)
    faded[binary > 0] = (20, 20, 20)
    return faded


def overlay_mask(img: np.ndarray, mask: np.ndarray | None) -> np.ndarray:
    out = (img * 0.5).astype(np.uint8)
    if mask is not None:
        out[mask > 0] = img[mask > 0]
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(out, contours, -1, (255, 60, 60), 3)
    return out


def regions_image(seg) -> np.ndarray:
    colors = np.array([[int(r.hex[i : i + 2], 16) for i in (1, 3, 5)] for r in seg.regions], dtype=np.uint8)
    img = colors[seg.labels]
    edge = np.zeros(seg.labels.shape, bool)
    edge[:, 1:] |= seg.labels[:, 1:] != seg.labels[:, :-1]
    edge[1:, :] |= seg.labels[1:, :] != seg.labels[:-1, :]
    img[edge] = (30, 30, 30)
    return img


def tile(images: list[tuple[str, np.ndarray]], width: int = 480) -> np.ndarray:
    """Gabungkan beberapa gambar berlabel jadi satu lembar perbandingan (3 kolom)."""
    cells = []
    for label, im in images:
        h, w = im.shape[:2]
        im = cv2.resize(im, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)
        bar = np.full((34, width, 3), 255, np.uint8)
        cv2.putText(bar, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
        cells.append(np.vstack([bar, im]))
    height = max(c.shape[0] for c in cells)
    cells = [np.vstack([c, np.full((height - c.shape[0], width, 3), 255, np.uint8)]) for c in cells]
    while len(cells) % 3:
        cells.append(np.full((height, width, 3), 255, np.uint8))
    rows = [np.hstack(cells[i : i + 3]) for i in range(0, len(cells), 3)]
    return np.vstack(rows)


def save(path: Path, rgb: np.ndarray) -> None:
    cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))


def evaluate(photo: Path, methods: list[str], mask_models: list[str]) -> dict:
    out = OUT / photo.stem
    out.mkdir(parents=True, exist_ok=True)
    peak = Peak()
    report: dict = {"photo": photo.name, "lineart": {}, "mask": {}}

    img, t = timed(lambda: normalize.normalize(photo.read_bytes()), peak)
    report["size"] = [img.shape[1], img.shape[0]]
    report["normalize_ms"] = t
    q = quality.assess(img)
    report["quality"] = {"usable": q.usable, "reasons": q.reasons, "blur": q.blur, "brightness": q.brightness}
    sheet = [("asli", img)]

    for m in methods:
        try:
            edges, t = timed(lambda: lineart.edge_map(img, m), peak)
            binary = lineart.clean_lines(edges)
            report["lineart"][m] = {"ms": t, **lineart.line_stats(binary)}
            vis = overlay_lines(img, binary)
            save(out / f"lines_{m}.png", vis)
            sheet.append((f"garis: {m}", vis))
        except Exception as exc:  # noqa: BLE001
            report["lineart"][m] = {"error": f"{type(exc).__name__}: {exc}"}

    chosen_mask = None
    for mm in mask_models:
        try:
            mask, t = timed(lambda: main_object_mask(img, mm), peak)
            report["mask"][mm] = {"ms": t, "coverage_pct": None if mask is None else round(float((mask > 0).mean() * 100), 1), "reliable": mask is not None}
            vis = overlay_mask(img, mask)
            save(out / f"mask_{mm}.png", vis)
            sheet.append((f"mask: {mm}", vis))
            if chosen_mask is None:
                chosen_mask = mask
        except Exception as exc:  # noqa: BLE001
            report["mask"][mm] = {"error": f"{type(exc).__name__}: {exc}"}

    seg, t = timed(lambda: segment(img, chosen_mask), peak)
    report["regions"] = {"ms": t, "count": len(seg.regions), "main_object": [r.code for r in seg.regions if r.is_main_object], "background": [r.code for r in seg.regions if r.is_background]}
    reg_img = regions_image(seg)
    save(out / "regions.png", reg_img)
    sheet.append((f"region ({len(seg.regions)})", reg_img))

    hint = value.shading_hint(seg)
    quant = value.value_levels(seg, 4)
    gray = np.array([[51], [112], [173], [230]], dtype=np.uint8)[quant][..., 0]
    val_img = np.repeat(gray[..., None], 3, axis=2)
    save(out / "value.png", val_img)
    sheet.append((f"terang-gelap (hint {hint:.2f})", val_img))
    report["shading_hint"] = round(hint, 3)

    numbered = render.numbered_image(seg)
    save(out / "numbered.png", numbered)
    save(out / "sheet.png", tile(sheet))

    report["peak_rss_mb"] = round(peak.mb)
    (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def summary_md(reports: list[dict], methods: list[str], mask_models: list[str]) -> str:
    lines = ["# Hasil evaluasi CV", "", f"Foto: {len(reports)}", ""]
    lines += ["## Garis sketsa", "", "Kepadatan = % piksel garis; segmen/MP = jumlah potongan garis per megapiksel (tinggi = berisik).", ""]
    lines.append("| Foto | " + " | ".join(f"{m} (ms / kepadatan / segmen/MP)" for m in methods) + " |")
    lines.append("| --- |" + " --- |" * len(methods))
    for r in reports:
        cells = []
        for m in methods:
            d = r["lineart"].get(m, {})
            cells.append(d["error"][:40] if "error" in d else f'{d["ms"]} / {d["density_pct"]} / {d["segments_per_mp"]}')
        lines.append(f'| {r["photo"]} | ' + " | ".join(cells) + " |")
    if mask_models:
        lines += ["", "## Mask objek utama", ""]
        lines.append("| Foto | " + " | ".join(f"{m} (ms / cakupan %)" for m in mask_models) + " |")
        lines.append("| --- |" + " --- |" * len(mask_models))
        for r in reports:
            cells = []
            for m in mask_models:
                d = r["mask"].get(m, {})
                cells.append(d["error"][:40] if "error" in d else f'{d["ms"]} / {d["coverage_pct"] if d["reliable"] else "tidak andal"}')
            lines.append(f'| {r["photo"]} | ' + " | ".join(cells) + " |")
    lines += ["", "## Region, terang-gelap, kualitas, RAM", ""]
    lines.append("| Foto | Region | ms | shading_hint | Kualitas | RAM puncak (MB) |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for r in reports:
        qual = "layak" if r["quality"]["usable"] else ", ".join(r["quality"]["reasons"])
        lines.append(f'| {r["photo"]} | {r["regions"]["count"]} | {r["regions"]["ms"]} | {r["shading_hint"]} | {qual} | {r["peak_rss_mb"]} |')
    lines += ["", "Lihat `eval/out/<foto>/sheet.png` untuk perbandingan visual."]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="tanpa model (xdog, canny; tanpa mask)")
    args = parser.parse_args()
    methods = ["xdog", "canny"] if args.quick else ["model", "teed", "xdog", "canny"]
    mask_models = [] if args.quick else ["isnet-general-use", "u2net"]

    photos = sorted(p for p in PHOTOS.iterdir() if p.suffix.lower() in EXTS)
    if not photos:
        sys.exit(f"Tidak ada foto di {PHOTOS}. Taruh 5 foto uji (JPG/PNG/WebP) lalu jalankan lagi.")
    OUT.mkdir(exist_ok=True)
    reports = []
    for p in photos:
        print(f"- {p.name}", flush=True)
        reports.append(evaluate(p, methods, mask_models))
    (OUT / "summary.md").write_text(summary_md(reports, methods, mask_models), encoding="utf-8")
    print(f"Selesai. Ringkasan: {OUT / 'summary.md'}")


if __name__ == "__main__":
    main()
