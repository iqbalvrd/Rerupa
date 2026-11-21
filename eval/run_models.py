"""Uji 2–3 model OpenAI untuk tugas A (teks tahapan) dan B (feedback checkpoint) — Rencana §3.1, PLAN Fase 3.

Dari folder api/:
    uv run --group cv python ../eval/run_models.py
    uv run --group cv python ../eval/run_models.py --models gpt-6.1-terra --artworks lukisan-kain-bali-goteborg

Untuk setiap materi koleksi di content/artworks/ (gambar publik, bukan foto pengguna):
- Tugas A: pipeline CV + stage_planner → write_lesson_text (prompt, validator, retry, sanitize asli).
- Tugas B: foto progres sintetis (sketsa digeser 7% ke kanan) → CV checkpoint → write_feedback.
Dicatat per model: lolos validator di percobaan pertama, perlu retry, perbaikan paksa, jatuh ke templat,
latensi, token, biaya (harga per 1 juta token di MODELS). Teks lengkap disimpan untuk ditinjau manusia.

Hasil: eval/out/models/<model>/<slug>.json dan ringkasan eval/out/models/summary.md
"""

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "api"), str(ROOT / "api" / "tests")]

import warnings  # noqa: E402

warnings.filterwarnings("ignore")

import checkpoint_synth as S  # noqa: E402
from ai import feedback as fb_mod  # noqa: E402
from ai import lesson_text as lt  # noqa: E402
from ai import openai_client as oc  # noqa: E402
from core.config import get_settings  # noqa: E402
from cv import checkpoint as cp  # noqa: E402
from cv import pipeline  # noqa: E402
from cv.compare import TargetRegion  # noqa: E402
from cv.normalize import encode_jpeg  # noqa: E402
from cv.stage_planner import plan_stages  # noqa: E402
from services.lessons import grid_svg  # noqa: E402

# model → (harga input, harga output) USD per 1 juta token (developers.openai.com/api/docs/pricing, 21 Nov 2026)
MODELS = {
    "gpt-6.2-sol": (2.00, 10.00),
    "gpt-6.1-terra": (1.00, 5.00),
    "gpt-6-luna": (0.10, 0.50),
}
ARTWORKS = ["raden-saleh-penangkapan-diponegoro", "lukisan-kain-bali-goteborg", "batik-sarung-buketan-cooper-hewitt", "mas-pirngadie-sawah-berundak"]
OUT = ROOT / "eval" / "out" / "models"


def prepare(slug: str) -> dict:
    folder = ROOT / "content" / "artworks" / slug
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    image = (folder / meta["image"]).read_bytes()
    cv = pipeline.run(image, scope=meta.get("scope"), canvas_size="A4", lineart_method="teed", mask_model="u2net", use_shading=meta.get("use_shading"))
    stages = plan_stages(cv.regions, use_shading=cv.use_shading, checkpoint_count=2, has_main_object_layer=cv.main_object_svg is not None)
    _, gmeta = grid_svg(cv.width, cv.height)
    grid = (gmeta["cols"], gmeta["rows"])
    target = cp.TargetLesson(cv.width, cv.height, cv.regions_svg, cv.sketch_svg, cv.main_object_svg,
                             [TargetRegion(r.code, r.hex, r.area_pct, r.is_background, r.is_main_object) for r in cv.regions], grid)
    paper = S.drawing_from_svg(cv.sketch_svg, cv.width, cv.height, grid, shift=(round(cv.width * 0.07), 0))
    photo, corners = S.photograph_any(paper)
    check = cp.run(encode_jpeg(photo, 92), corners, target, "sketch", set())
    return {"meta": meta, "cv": cv, "stages": stages, "check": check}


class Recorder:
    """Membungkus oc.parse dan find_errors untuk mencatat tiap percobaan."""

    def __init__(self):
        self.calls: list[dict] = []
        self.errors: list[list[str]] = []
        self._parse = oc.parse
        self._lt_find = lt.find_errors
        self._fb_find = fb_mod.find_errors

    def install(self):
        def parse(**kw):
            t = time.perf_counter()
            try:
                res = self._parse(**kw)
                self.calls.append({"task": kw["task"], "ok": True, "latency_s": res.latency_ms / 1000, "in": res.input_tokens, "out": res.output_tokens})
                return res
            except oc.AIUnavailable as exc:
                self.calls.append({"task": kw["task"], "ok": False, "error": exc.code, "latency_s": time.perf_counter() - t, "in": 0, "out": 0})
                raise

        def lt_find(*a, **k):
            e = self._lt_find(*a, **k)
            self.errors.append(e)
            return e

        def fb_find(*a, **k):
            e = self._fb_find(*a, **k)
            self.errors.append(e)
            return e

        oc.parse = parse
        lt.oc.parse = parse
        fb_mod.oc.parse = parse
        lt.find_errors = lt_find
        fb_mod.find_errors = fb_find

    def reset(self):
        self.calls, self.errors = [], []


def use_model(model: str):
    real = get_settings()
    price_in, price_out = MODELS[model]
    fake = SimpleNamespace(**{**real.model_dump(), "openai_vision_model": model, "openai_text_model": model,
                              "openai_price_input_per_m": price_in, "openai_price_output_per_m": price_out})
    fake.openai_configured = real.openai_configured
    fake.openai_api_key = real.openai_api_key
    oc.get_settings = lambda: fake
    oc._client.cache_clear()


def cost(calls: list[dict], model: str) -> float:
    pi, po = MODELS[model]
    return sum(c["in"] * pi + c["out"] * po for c in calls) / 1e6


def run(models: list[str], slugs: list[str]) -> list[dict]:
    rec = Recorder()
    rec.install()
    rows = []
    for slug in slugs:
        print(f"== {slug}: CV …", flush=True)
        prep = prepare(slug)
        cv, stages, check = prep["cv"], prep["stages"], prep["check"]
        for model in models:
            use_model(model)
            (OUT / model).mkdir(parents=True, exist_ok=True)

            rec.reset()
            t = time.perf_counter()
            text, source, notes = lt.write_lesson_text(cv, stages, use_ai=True, safety_id="rs_eval_models", job_id=None)
            a = {"wall_s": time.perf_counter() - t, "source": source, "notes": notes, "calls": rec.calls, "errors": rec.errors}
            labels = {l.region_code: l.label for l in text.region_labels}

            rec.reset()
            t = time.perf_counter()
            fbt, fsrc, fnotes = fb_mod.write_feedback(
                stage_kind="sketch", stage_title="Sketsa bentuk besar", candidates=check.candidates, metrics=check.metrics,
                labels=labels, use_shading=cv.use_shading, overlay_jpeg=check.overlay_jpeg, use_ai=True,
                safety_id="rs_eval_models", job_id=None,
            )
            b = {"wall_s": time.perf_counter() - t, "source": fsrc, "notes": fnotes, "calls": rec.calls, "errors": rec.errors}

            row = {"model": model, "slug": slug, "a": a, "b": b, "cost_a": cost(a["calls"], model), "cost_b": cost(b["calls"], model),
                   "candidates": check.candidates}
            (OUT / model / f"{slug}.json").write_text(json.dumps({**row, "lesson_text": text.model_dump(), "feedback": fbt.model_dump()}, ensure_ascii=False, indent=2), encoding="utf-8")
            rows.append(row)
            print(f"   {model}: A {source} {a['wall_s']:.1f}s {len(a['calls'])} panggilan ${row['cost_a']:.4f} | B {fsrc} {b['wall_s']:.1f}s ${row['cost_b']:.4f} | catatan {notes} {fnotes}", flush=True)
    return rows


def summarize(rows: list[dict], models: list[str]) -> str:
    lines = ["| Model | Tugas | Lolos percobaan 1 | Perlu retry | Perbaikan paksa / templat | Latensi rata-rata | Token masuk / keluar rata-rata | Biaya rata-rata |",
             "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for m in models:
        for task in ("a", "b"):
            rs = [r[task] for r in rows if r["model"] == m]
            n = len(rs)
            if not n:
                continue
            first_ok = sum(1 for r in rs if r["source"] == "ai" and r["errors"][:1] == [[]])
            retried = sum(1 for r in rs if len(r["errors"]) > 1)
            forced = sum(1 for r in rs if r["source"] != "ai" or any(x.startswith("retry_failed") for x in r["notes"]))
            calls = [c for r in rs for c in r["calls"]]
            lat = statistics.mean(r["wall_s"] for r in rs)
            tin = statistics.mean(c["in"] for c in calls) if calls else 0
            tout = statistics.mean(c["out"] for c in calls) if calls else 0
            c = statistics.mean(r2["cost_" + task] for r2 in rows if r2["model"] == m)
            lines.append(f"| {m} | {'A teks tahapan' if task == 'a' else 'B feedback'} | {first_ok}/{n} | {retried}/{n} | {forced}/{n} | {lat:.1f} s | {tin:.0f} / {tout:.0f} | ${c:.4f} |")
    return "\n".join(lines)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=list(MODELS))
    ap.add_argument("--artworks", nargs="*", default=ARTWORKS)
    args = ap.parse_args()
    if not get_settings().openai_configured:
        sys.exit("OPENAI_API_KEY belum diisi di api/.env")
    rows = run(args.models, args.artworks)
    text = "# Ringkasan uji model\n\n" + summarize(rows, args.models) + "\n"
    (OUT / "summary.md").write_text(text, encoding="utf-8")
    (OUT / "rows.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n" + text)


if __name__ == "__main__":
    main()
