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
| `services/` | Logika: jobs, uploads, storage (signed URL) |
| `cv/` | Pipeline CV: normalisasi, cek kualitas, mask (rembg), garis (model/TEED/XDoG/Canny), region k-means, terang-gelap, render SVG/PNG |
| `ai/`, `color/`, `story/` | Diisi di Fase 3–4 dan P1 |
| `examples/` | Contoh respons JSON untuk frontend |
| `tests/` | Tes unit dan integrasi |

Migrasi database ada di `../supabase/migrations/` dan sudah diterapkan ke project Supabase Rerupa.

## Yang belum ada (fase berikutnya)

- `stage_planner`, teks OpenAI, resep warna (Fase 3–4). Pipeline CV sudah ada, tetapi belum disambungkan ke job — `generate_lesson` masih berakhir `pipeline_not_ready`.
- Checkpoint dan progres tahap (Fase 5).
- Rate limit per IP dan deploy (Fase 6).
- Retensi otomatis 24 jam untuk unggahan yang sesinya tidak dihapus (Fase 7). Saat sesi dihapus, file foto sudah langsung dihapus.
