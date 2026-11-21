# Rerupa API

Backend FastAPI + worker untuk Rerupa. Lihat `../SYSTEM_ARCHITECTURE.md` dan `../RENCANA_PENGERJAAN.md`. Panduan untuk frontend: [API.md](API.md).

## Menjalankan lokal

```bash
cd api
cp .env.example .env   # lalu isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
uv sync --group cv     # dependensi dasar + computer vision
uv run uvicorn main:app --reload
```

Worker (terminal terpisah):

```bash
uv run python worker.py
```

Cek: http://localhost:8000/health dan dokumentasi API di http://localhost:8000/docs

## Tes

```bash
uv run pytest
```

- `tests/test_unit.py` — tanpa jaringan.
- `tests/test_integration.py` — memakai project Supabase dari `.env` (otomatis dilewati bila belum dikonfigurasi) dan membersihkan data ujinya sendiri.
- `tests/test_cv.py` — pipeline CV dengan gambar sintetis. Tes model pretrained: `RUN_MODEL_TESTS=1 uv run --group cv pytest tests/test_cv.py` (unduh bobot ±350 MB sekali).

Evaluasi CV pada foto nyata: lihat [`../eval/README.md`](../eval/README.md).

## Struktur

| Folder/file | Isi |
| --- | --- |
| `main.py` | Aplikasi FastAPI, CORS, cek origin, rate limit, header keamanan, batas ukuran request, cek konfigurasi produksi |
| `Dockerfile`, `railway.toml`, [`DEPLOY.md`](DEPLOY.md) | Image deploy (torch CPU + bobot model di-cache saat build) untuk service `api` dan `worker` |
| `worker.py`, `worker_handlers.py`, `worker_feedback.py` | Worker antrean job (feedback didahulukan) dan handler per jenis job |
| `core/` | Config, error terstandar, sesi tamu, keamanan, log JSON, idempotency, rate limit |
| `routes/` | Endpoint: health, artworks, sessions, jobs, lessons, palettes (+ recipes), progress (+ events), checkpoints |
| `services/` | Logika: jobs, uploads, storage (signed URL, retry), lessons (unggah lapisan + simpan atomik), progress, events, retention |
| `cv/` | Pipeline CV: normalisasi, cek kualitas, mask (rembg), garis (model/TEED/XDoG/Canny), region k-means, terang-gelap, render SVG/PNG, `stage_planner` (pembagian region ke 6–8 tahap); checkpoint: `align` (tap 4 sudut → warp → ECC ke grid), `compare` (metrik + kandidat), `checkpoint` (orkestrasi + kualitas), `svgpath` (SVG lapisan → raster) |
| `ai/` | Teks tutorial dan feedback checkpoint (`feedback.py`: maks 2 saran dari kandidat CV): skema keluaran, prompt, klien OpenAI (Responses API + structured output, catat biaya), validator aturan PRD, templat cadangan |
| `color/` | Perkiraan campuran cat: Mixbox (model pigmen) + ΔE2000, 1–3 cat + campuran tint (putih banyak), resep teruji diutamakan |
| `scripts/import_collection.py`, `scripts/import_palette.py`, `scripts/smoke.py` (uji alur lengkap ke API berjalan), `scripts/measure_p95.py` (ukur P95), `scripts/report_ai.py` (lolos validator + biaya) | Impor materi koleksi (`../content/artworks/<slug>/`) dan palet (`../content/palettes/*.json`) |
| `story/` | P1 |
| `examples/` | Contoh respons JSON untuk frontend |
| `tests/` | Tes unit dan integrasi |

Migrasi database ada di `../supabase/migrations/` dan sudah diterapkan ke project Supabase Rerupa.

## Yang belum ada (fase berikutnya)

- **OpenAI belum dikonfigurasi** — semua tutorial memakai teks templat sampai `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, dan harga per token diisi. Jalur AI sudah diuji dengan respons tiruan, belum dengan API sungguhan; uji 2–3 model dilakukan setelah key ada.
- Palet yang aktif masih **palet referensi digital** (warna pigmen Mixbox), bukan cat fisik. Ganti dengan palet cat demo yang swatch-nya difoto (PRD §9), lalu tambahkan resep teruji ke `color_recipes`. Lisensi Mixbox CC BY-NC: aman untuk lomba, perlu lisensi untuk komersial.
- Checkpoint (sketsa + tahap warna) baru dikalibrasi dengan foto sintetis (`tests/checkpoint_synth.py`); uji foto progres nyata lewat `../eval/run_checkpoint.py`, lalu sesuaikan ambang.
- Deploy ke Railway belum dilakukan (butuh akun tim) — semua bahan siap, lihat [DEPLOY.md](DEPLOY.md). Dockerfile belum pernah di-build di laptop (tanpa Docker).

## Retensi (PRD §17)

| Data | Kapan dihapus | Oleh |
| --- | --- | --- |
| Foto unggahan + foto progres yang diluruskan | 24 jam setelah unggah | worker tiap 15 menit (`services/retention.py`) |
| Lapisan tutorial mode bebas yang diturunkan dari foto (foto asli, garis, region, sketsa, objek, terang-gelap) | 24 jam setelah foto diunggah; grid tetap | worker |
| Sesi terhapus / kedaluwarsa (7 hari) + semua datanya (CASCADE) | ≤15 menit setelah dihapus/kedaluwarsa | worker (file dulu, lalu baris) |
| `events` > 180 hari, `ai_usage` > 90 hari | tiap 15 menit | `pg_cron` (`retention_db()`) |

Teks tahap, resep, dan teks feedback tetap tersedia sampai sesi berakhir.

## Worker

Saat start, worker memuat model CV lebih dulu (±30 s) supaya job pertama pengguna tidak menunggu unduhan/pemuatan model. Job berikutnya ±10–15 s (laptop, CPU, tanpa AI). Selama job berjalan, worker mengirim heartbeat tiap 30 s agar job panjang tidak dianggap macet.
