"""Smoke test end-to-end terhadap API yang berjalan (lokal atau produksi), seperti pengguna sungguhan.

Dari folder api/:
    uv run --group cv python scripts/smoke.py --base-url https://<api-produksi>
    uv run --group cv python scripts/smoke.py --base-url http://localhost:8000   # API + worker lokal

Alur: health → galeri → sesi → unggah foto sintetis (mode bebas) → tunggu tutorial → baca lesson
→ progres → checkpoint sketsa sintetis → tunggu feedback → hapus sesi. Mencetak waktu tiap langkah.
Data uji dihapus di akhir (DELETE /sessions). Tidak memakai rahasia apa pun.
"""

import argparse
import io
import json
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]


def figure_jpeg() -> bytes:
    from PIL import Image
    from test_cv import figure_image

    buf = io.BytesIO()
    Image.fromarray(figure_image()).save(buf, "JPEG", quality=92)
    return buf.getvalue()


def wait_job(c: httpx.Client, job_id: str, limit: float) -> dict:
    start = time.monotonic()
    while True:
        job = c.get(f"/jobs/{job_id}").json()
        if job["is_final"]:
            return job
        if time.monotonic() - start > limit:
            raise SystemExit(f"job {job_id} belum selesai setelah {limit:.0f} s (status {job['status']}, step {job['progress']})")
        time.sleep(1)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # konsol Windows
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    args = ap.parse_args()
    results: list[tuple[str, str, float]] = []

    def step(name: str, fn):
        t = time.monotonic()
        out = fn()
        results.append((name, "ok", time.monotonic() - t))
        print(f"OK {name} ({time.monotonic() - t:.1f} s)")
        return out

    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=60) as c:
        health = step("health", lambda: c.get("/health").json())
        print("  ", health)
        arts = step("galeri", lambda: c.get("/artworks").json())
        print(f"   {len(arts)} materi terbit")
        sess = step("buat sesi", lambda: c.post("/sessions", json={"canvas_size": "A4"}).json())
        sid = sess["id"]
        try:
            job = step("unggah foto", lambda: c.post(
                "/lessons/generate",
                files={"file": ("smoke.jpg", figure_jpeg(), "image/jpeg")},
                data={"consent_ai_photo": "false"},
                headers={"Idempotency-Key": str(uuid.uuid4())},
            ).json())
            done = step("tunggu tutorial", lambda: wait_job(c, job["id"], 90))
            assert done["status"] == "succeeded", done
            lesson = step("baca lesson", lambda: c.get(f"/lessons/{done['lesson_version_id']}").json())
            print(f"   {len(lesson['stages'])} tahap, {len(lesson['regions'])} region, {len(lesson['region_colors'])} saran warna")
            step("progres", lambda: c.patch(f"/sessions/{sid}/progress", json={"stage_code": lesson["stages"][0]["code"], "status": "completed"}).json())

            import checkpoint_synth as S
            from cv.normalize import encode_jpeg

            sketch = next(l for l in lesson["layers"] if l["kind"] == "sketch")
            grid = next(l for l in lesson["layers"] if l["kind"] == "grid")["meta"]
            paper = S.drawing_from_svg(S.fetch_text(sketch["url"]), lesson["image_width"], lesson["image_height"], (grid["cols"], grid["rows"]))
            photo, corners = S.photograph_any(paper)
            stage = next(s for s in lesson["stages"] if s["is_checkpoint"])
            cp = step("unggah checkpoint", lambda: c.post(
                f"/sessions/{sid}/checkpoints",
                files={"file": ("progress.jpg", encode_jpeg(photo, 92), "image/jpeg")},
                data={"stage_code": stage["code"], "corners": json.dumps(corners)},
                headers={"Idempotency-Key": str(uuid.uuid4())},
            ).json())
            fdone = step("tunggu feedback", lambda: wait_job(c, cp["id"], 60))
            fb = c.get(f"/sessions/{sid}/checkpoints/{cp['id']}").json()
            print(f"   status {fdone['status']}: {fb['summary']} ({len(fb['suggestions'])} saran)")
        finally:
            r = c.delete(f"/sessions/{sid}")
            print(f"OK hapus sesi ({r.status_code})")

    print("\nRingkasan:", ", ".join(f"{n} {t:.1f}s" for n, _, t in results))


if __name__ == "__main__":
    main()
