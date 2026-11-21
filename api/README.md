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
| `main.py` | Aplikasi FastAPI, CORS, batas ukuran request |
| `worker.py`, `worker_handlers.py` | Worker antrean job dan handler per jenis job |
| `core/` | Config, error terstandar, sesi tamu, keamanan, log JSON, idempotency |
| `routes/` | Endpoint: health, artworks, sessions, jobs, lessons |
| `services/` | Logika: jobs, uploads, storage (signed URL, retry), lessons (unggah lapisan + simpan atomik) |
| `cv/` | Pipeline CV: normalisasi, cek kualitas, mask (rembg), garis (model/TEED/XDoG/Canny), region k-means, terang-gelap, render SVG/PNG, `stage_planner` (pembagian region ke 6–8 tahap) |
| `ai/` | Teks tutorial: skema keluaran, prompt, klien OpenAI (Responses API + structured output, catat biaya), validator aturan PRD, templat cadangan |
| `scripts/import_collection.py` | Impor materi koleksi dari `../content/artworks/<slug>/` |
| `color/`, `story/` | Diisi di Fase 4 dan P1 |
| `examples/` | Contoh respons JSON untuk frontend |
| `tests/` | Tes unit dan integrasi |

Migrasi database ada di `../supabase/migrations/` dan sudah diterapkan ke project Supabase Rerupa.

## Yang belum ada (fase berikutnya)

- **OpenAI belum dikonfigurasi** — semua tutorial memakai teks templat sampai `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, dan harga per token diisi. Jalur AI sudah diuji dengan respons tiruan, belum dengan API sungguhan; uji 2–3 model dilakukan setelah key ada.
- Resep warna (Fase 4) — `region_colors` masih kosong.
- Checkpoint dan progres tahap (Fase 5).
- Rate limit per IP dan deploy (Fase 6).
- Retensi otomatis (Fase 7): unggahan ≤24 jam **dan** folder lapisan `derived/<session_id>/` saat sesi kedaluwarsa. Saat sesi dihapus lewat API, keduanya sudah langsung dihapus.

## Worker

Saat start, worker memuat model CV lebih dulu (±30 s) supaya job pertama pengguna tidak menunggu unduhan/pemuatan model. Job berikutnya ±10–15 s (laptop, CPU, tanpa AI). Selama job berjalan, worker mengirim heartbeat tiap 30 s agar job panjang tidak dianggap macet.
