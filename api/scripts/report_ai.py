"""Laporan AI dari database (Rencana §8, SYSTEM_ARCHITECTURE §13): tingkat lolos validator,
penolakan/timeout, biaya per tutorial dan per feedback.

Dari folder api/:  uv run python scripts/report_ai.py [--days 7] [--out ../eval/LAPORAN_AI.md]

Sumber: ai_usage (setiap panggilan OpenAI) + jobs.result.text_source/notes (hasil akhir per job).
"Lolos validator" = job yang teksnya dari AI tanpa perbaikan paksa (notes tanpa retry_failed*).
"""

import argparse
import sys
from collections import Counter
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.session import now_utc  # noqa: E402
from core.supabase_client import get_supabase  # noqa: E402


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # konsol Windows
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    since = (now_utc() - timedelta(days=args.days)).isoformat()
    db = get_supabase()

    usage = db.table("ai_usage").select("job_id, task, model, outcome, cost_usd, input_tokens, output_tokens").gte("created_at", since).execute().data
    jobs = db.table("jobs").select("id, type, status, result").in_("type", ["generate_lesson", "feedback"]).eq("status", "succeeded").gte("created_at", since).execute().data

    lines = [f"# Laporan AI — {args.days} hari terakhir", ""]
    lines += ["## Panggilan OpenAI (`ai_usage`)", "", "| Tugas | Panggilan | ok | retry/skema | ditolak | terpotong | timeout/error | Biaya |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for task in sorted({u["task"] for u in usage}) or ["—"]:
        rows = [u for u in usage if u["task"] == task]
        oc = Counter(u["outcome"] for u in rows)
        cost = sum(float(u["cost_usd"]) for u in rows)
        lines.append(f"| {task} | {len(rows)} | {oc['ok']} | {oc['retry'] + oc['schema_error']} | {oc['refusal']} | {oc['truncated']} | {oc['timeout'] + oc['error']} | ${cost:.4f} |")

    lines += ["", "## Hasil per job (berhasil)", "", "| Jenis | Job | Teks AI lolos validator | Teks AI setelah perbaikan paksa | Templat | Alasan templat teratas | Biaya rata-rata/job |", "| --- | --- | --- | --- | --- | --- | --- |"]
    cost_by_job = Counter()
    for u in usage:
        if u["job_id"]:
            cost_by_job[u["job_id"]] += float(u["cost_usd"])
    for jtype in ("generate_lesson", "feedback"):
        rows = [j for j in jobs if j["type"] == jtype]
        if not rows:
            lines.append(f"| {jtype} | 0 | – | – | – | – | – |")
            continue
        src = [(j["result"] or {}).get("text_source") for j in rows]
        notes = [(j["result"] or {}).get("notes") or [] for j in rows]
        ai_clean = sum(1 for s, n in zip(src, notes) if s == "ai" and not any(x.startswith("retry_failed") for x in n))
        ai_forced = sum(1 for s, n in zip(src, notes) if s == "ai" and any(x.startswith("retry_failed") for x in n))
        tmpl = sum(1 for s in src if s != "ai")
        reasons = Counter(x for s, n in zip(src, notes) if s != "ai" for x in n).most_common(3)
        avg = sum(cost_by_job[j["id"]] for j in rows) / len(rows)
        pct = lambda k: f"{k} ({k / len(rows) * 100:.0f}%)"  # noqa: E731
        lines.append(f"| {jtype} | {len(rows)} | {pct(ai_clean)} | {pct(ai_forced)} | {pct(tmpl)} | {', '.join(f'{k}×{v}' for k, v in reasons) or '–'} | ${avg:.4f} |")

    total = sum(float(u["cost_usd"]) for u in usage)
    lines += ["", f"Total biaya tercatat: **${total:.4f}**. Biaya dihitung dari `OPENAI_PRICE_*`; bila harga belum diisi, biaya tercatat 0."]
    if not usage:
        lines += ["", "> Belum ada panggilan OpenAI (key belum diisi atau pengguna tidak memberi izin AI). Semua teks memakai templat."]
    text = "\n".join(lines)
    print(text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
