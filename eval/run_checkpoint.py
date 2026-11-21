"""Evaluasi checkpoint pada foto progres NYATA (Fase 5).

Siapkan `eval/checkpoint/cases.json` (tidak di-commit bersama fotonya):

[
  {"photo": "sketsa_benar.jpg", "lesson_id": "<uuid lesson>", "stage_code": "stage_2",
   "corners": [x1, y1, x2, y2, x3, y3, x4, y4], "expect": "ok"},
  {"photo": "sketsa_geser.jpg", ..., "expect": "suggestion"},
  {"photo": "buram.jpg", ..., "expect": "retake"}
]

`corners` = 4 sudut bidang lukis dalam piksel foto (urutan bebas), sama seperti tap di aplikasi.
`expect`: ok (tanpa saran), suggestion (ada saran), retake (minta foto ulang).

Jalankan dari folder api/:  uv run --group cv python ../eval/run_checkpoint.py
Hasil: eval/checkpoint/out/<foto>_overlay.jpg (garis panduan merah + kandidat) dan summary.md.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from ai.feedback import template_feedback  # noqa: E402
from cv import checkpoint as cp  # noqa: E402
from services.uploads import clean_image  # noqa: E402
from worker_feedback import load_target, open_region_codes  # noqa: E402

from core.supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).resolve().parent / "checkpoint"


def main() -> None:
    cases = json.loads((ROOT / "cases.json").read_text(encoding="utf-8"))
    out = ROOT / "out"
    out.mkdir(parents=True, exist_ok=True)
    lines = ["| Foto | Harapan | Hasil | Kode | Penyelarasan | Kandidat | Saran (templat) | Waktu CV |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    passed = 0
    for case in cases:
        stage = get_supabase().table("stages").select("order_no, kind").eq("lesson_version_id", case["lesson_id"]).eq("code", case["stage_code"]).limit(1).execute().data[0]
        _, target, labels = load_target(case["lesson_id"])
        photo = clean_image((ROOT / case["photo"]).read_bytes()).jpeg_bytes  # sama seperti unggahan: EXIF diterapkan
        res = cp.run(photo, case["corners"], target, stage["kind"], open_region_codes(case["lesson_id"], stage["order_no"]))
        got = "retake" if res.needs_retake else ("suggestion" if res.candidates else "ok")
        passed += got == case["expect"]
        if res.overlay_jpeg:
            (out / f"{Path(case['photo']).stem}_overlay.jpg").write_bytes(res.overlay_jpeg)
        text = template_feedback(stage["kind"], res.candidates, res.metrics, labels) if not res.needs_retake else None
        sugg = "<br>".join(f"{s.observation} {s.action}" for s in text.suggestions) if text else ""
        cands = ", ".join(f"{c['region_code']}:{c['kind']}" for c in res.candidates)
        lines.append(f"| {case['photo']} | {case['expect']} | {'✅' if got == case['expect'] else '❌'} {got} | {res.retake_code or ''} | {res.alignment}/{res.alignment_method or '-'} | {cands} | {sugg} | {sum(res.timings_ms.values())} ms |")
    lines.append(f"\nSesuai harapan: {passed}/{len(cases)}")
    (out / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
