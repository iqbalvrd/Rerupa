"""Ukur P95 alur pembuatan tutorial dan feedback (PRD §16: tutorial ≤60 s, feedback P95 ≤30 s; Rencana §8).

Dari folder api/:
    uv run --group cv python scripts/measure_p95.py --base-url http://localhost:8000 --runs 20
    uv run --group cv python scripts/measure_p95.py --base-url https://<api-produksi> --runs 20 --out ../eval/P95.md

Setiap putaran memakai sesi baru: unggah foto → tunggu tutorial → unggah foto progres sketsa → tunggu
feedback → hapus sesi. Waktu dihitung seperti yang dirasakan pengguna: dari permintaan dikirim sampai
polling melihat status final (termasuk antre). Sampel = jumlah putaran yang berhasil.

Catatan: 1 putaran = 1 sesi + 2 unggahan. Untuk pengukuran dari satu IP, batas RATE_LIMIT_SESSIONS_PER_IP_HOUR dan RATE_LIMIT_UPLOADS_PER_IP_HOUR
di server harus dinaikkan (atau 0 = nonaktif) selama pengukuran.
"""

import argparse
import json
import math
import statistics
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank (tanpa interpolasi): dengan 20 sampel, P95 = nilai ke-19."""
    s = sorted(values)
    return s[max(0, math.ceil(p / 100 * len(s)) - 1)]


def wait(c: httpx.Client, job_id: str, limit: float) -> dict:
    start = time.monotonic()
    while time.monotonic() - start < limit:
        job = c.get(f"/jobs/{job_id}").json()
        if job["is_final"]:
            return job
        time.sleep(0.5)
    return {"status": "client_timeout"}


def one_run(base: str, photo: bytes) -> dict:
    import checkpoint_synth as S
    from cv.normalize import encode_jpeg

    out: dict = {}
    with httpx.Client(base_url=base, timeout=60) as c:
        sid = c.post("/sessions", json={"canvas_size": "A4"}).json()["id"]
        try:
            t = time.monotonic()
            job = c.post("/lessons/generate", files={"file": ("m.jpg", photo, "image/jpeg")}, data={"consent_ai_photo": "false"}, headers={"Idempotency-Key": str(uuid.uuid4())}).json()
            if "id" not in job:  # mis. 429 rate limit: catat kodenya, jangan hentikan pengukuran
                out["generate_status"] = "http:" + (job.get("error") or {}).get("code", "unknown")
                return out
            done = wait(c, job["id"], 120)
            out["generate_s"] = time.monotonic() - t
            out["generate_status"] = done["status"]
            if done["status"] != "succeeded":
                return out
            t = time.monotonic()
            lesson = c.get(f"/lessons/{done['lesson_version_id']}").json()
            out["lesson_s"] = time.monotonic() - t
            sketch = next(l for l in lesson["layers"] if l["kind"] == "sketch")
            grid = next(l for l in lesson["layers"] if l["kind"] == "grid")["meta"]
            paper = S.drawing_from_svg(S.fetch_text(sketch["url"]), lesson["image_width"], lesson["image_height"], (grid["cols"], grid["rows"]))
            img, corners = S.photograph_any(paper, seed=int(time.time()) % 1000)
            stage = next(s for s in lesson["stages"] if s["is_checkpoint"])
            t = time.monotonic()
            cp = c.post(f"/sessions/{sid}/checkpoints", files={"file": ("p.jpg", encode_jpeg(img, 92), "image/jpeg")}, data={"stage_code": stage["code"], "corners": json.dumps(corners)}, headers={"Idempotency-Key": str(uuid.uuid4())}).json()
            fdone = wait(c, cp["id"], 90)
            out["feedback_s"] = time.monotonic() - t
            out["feedback_status"] = fdone["status"]
        finally:
            c.delete(f"/sessions/{sid}")
    return out


def summarize(name: str, values: list[float], target: float, total: int) -> str:
    if not values:
        return f"| {name} | 0/{total} | – | – | – | – | {target:.0f} s | ❌ |"
    p95 = percentile(values, 95)
    ok = "✅" if p95 <= target else "❌"
    return f"| {name} | {len(values)}/{total} | {statistics.median(values):.1f} s | {p95:.1f} s | {max(values):.1f} s | {min(values):.1f} s | {target:.0f} s | {ok} |"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # konsol Windows
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--runs", type=int, default=20)
    ap.add_argument("--out", default=None, help="tulis hasil Markdown ke file ini")
    ap.add_argument("--parallel", type=int, default=1, help="jumlah pengguna serentak (simulasi uji pengguna)")
    args = ap.parse_args()

    from smoke import figure_jpeg

    photo = figure_jpeg()
    runs = []
    def safe_run(_):
        try:
            return one_run(args.base_url.rstrip("/"), photo)
        except Exception as exc:  # noqa: BLE001
            # Gangguan jaringan/respons tak terduga dicatat sebagai putaran gagal, bukan menghentikan pengukuran.
            return {"generate_status": f"error:{type(exc).__name__}"}

    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as pool:
        for i, r in enumerate(pool.map(safe_run, range(args.runs))):
            runs.append(r)
            print(f"[{i + 1}/{args.runs}] tutorial {r.get('generate_s', 0):.1f} s ({r.get('generate_status')}), feedback {r.get('feedback_s', 0):.1f} s ({r.get('feedback_status')})", flush=True)

    gen = [r["generate_s"] for r in runs if r.get("generate_status") == "succeeded"]
    fb = [r["feedback_s"] for r in runs if r.get("feedback_status") == "succeeded"]
    lines = [
        f"# Ukur P95 — {time.strftime('%Y-%m-%d %H:%M')}",
        "",
        f"Server: `{args.base_url}` · putaran: {args.runs} · serentak: {args.parallel} · foto uji sintetis · tanpa AI (teks templat).",
        "Waktu = dari permintaan dikirim sampai polling melihat status final (termasuk antre).",
        "",
        "| Alur | Sampel berhasil | Median | P95 | Maks | Min | Target PRD | Lolos |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        summarize("Pembuatan tutorial (mode bebas)", gen, 60, args.runs),
        summarize("Feedback checkpoint", fb, 30, len([r for r in runs if r.get("generate_status") == "succeeded"])),
        summarize("Baca tutorial (GET /lessons, mode bebas)", [r["lesson_s"] for r in runs if "lesson_s" in r], 2, args.runs),
        "",
        "Gagal: " + (", ".join(f"putaran {i + 1}: {r.get('generate_status')}/{r.get('feedback_status')}" for i, r in enumerate(runs) if r.get("generate_status") != "succeeded" or r.get("feedback_status") != "succeeded") or "tidak ada"),
    ]
    text = "\n".join(lines)
    print("\n" + text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
