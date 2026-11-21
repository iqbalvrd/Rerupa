# Hasil optimasi latensi & perbaikan bug

Tanggal: 21 Nov 2026 · rencana & temuan: [`../ANALISA_OPTIMASI.md`](../ANALISA_OPTIMASI.md) · skrip ukur: `api/scripts/measure_p95.py`

Kondisi ukur: laptop pengembang (Windows, CPU), API + worker lokal, database & Storage Supabase **Singapura**, model produksi (TEED + u2net), tanpa AI (teks templat), foto uji sintetis. Waktu = dari permintaan dikirim sampai polling melihat status final (termasuk antre).

## 1. Satu pengguna (20 putaran berurutan)

| Alur | P95 sebelum | P95 sesudah | Median sebelum → sesudah |
| --- | --- | --- | --- |
| Pembuatan tutorial (mode bebas) | 14,4 s | **9,9 s** (−31%) | 9,5 → 7,3 s |
| Feedback checkpoint | 10,8 s | **9,2 s** (−15%) | 6,8 → 7,0 s |
| Baca tutorial `GET /lessons` | 1,4 s | **0,7 s** (−50%) | 0,8 → 0,3 s |

Pembanding lama (database Tokyo, sebelum pindah): tutorial P95 29,0 s, feedback 15,0 s ([P95_LOKAL.md](P95_LOKAL.md)).

## 2. Empat pengguna serentak (16 putaran)

| Alur | Worker 1 jalur (perilaku lama) | Worker 2 jalur (baru) |
| --- | --- | --- |
| Tutorial — median / P95 | 34,4 s / 42,4 s | **16,0 s / 30,1 s** |
| Feedback — median / P95 | 9,5 s / 14,0 s | 12,3 s / 19,7 s |
| Gagal | 0/16 | 0/16 |

Dengan 2 jalur, tutorial pengguna yang mengantre selesai **±2× lebih cepat**. Feedback sedikit lebih lambat karena CPU dibagi dua job CV sekaligus, tetapi tetap jauh di bawah batas 30 s. Di server, CPU worker yang lebih besar (2 vCPU penuh) mengurangi efek ini.

## 3. Bug yang ditemukan saat uji serentak

**Unggahan paralel menjatuhkan permintaan lain.** Klien Supabase bawaan memakai satu koneksi HTTP/2 untuk semua thread. Saat server menutup koneksi itu (`ConnectionTerminated`), semua permintaan yang sedang menumpang ikut gagal. Pada percobaan pertama uji 4 pengguna serentak, 3 dari 16 unggahan tutorial gagal dengan `internal_error`.

Reproduksi, 8 unggahan paralel × 80:

| Klien | Gagal |
| --- | --- |
| Bawaan (HTTP/2, satu koneksi) | **56/80** (`RemoteProtocolError`, `WriteError`) |
| Baru (pool HTTP/1.1, `core/supabase_client.py`) | **0/80** |

Tes regresi: `tests/test_perf.py::test_parallel_uploads_do_not_break_shared_connection`.

## 4. Yang diubah

| # | Perubahan | File |
| --- | --- | --- |
| A1 | Penyapu job di database: `sweep_jobs()` (requeue macet + gagalkan job lewat batas) via **pg_cron tiap 30 s**, tidak bergantung pada worker | migrasi 15 |
| A2 | Worker menangani SIGTERM: berhenti ambil job baru, job berjalan diselesaikan; draining 60 s | `worker.py`, `railway.worker.toml` |
| A3 | Rate limit per IP 600/menit, buat sesi 60/jam, unggah 80/jam (peserta satu Wi-Fi) | `core/config.py` |
| A4 | Bobot model diunduh di lapisan Docker sebelum kode | `Dockerfile.worker`, `scripts/fetch_models.py` |
| A5 | Retensi lapisan via RPC `expired_lesson_layers` (tanpa daftar ID panjang di URL) | migrasi 15, `services/retention.py` |
| B1 | Impor malas `color.mixer`: start API 7,3 → 3,5 s; API tanpa numpy/scipy/torch | `color/palettes.py` |
| B2 | Dua image: API ±65 MB dependensi (tanpa torch) dan worker CV | `Dockerfile.api`, `Dockerfile.worker` |
| B3 | Worker 2 jalur (`WORKER_CONCURRENCY`) | `worker.py` |
| B4 | Unggah lapisan tutorial paralel | `services/lessons.py` |
| B5 | `GET /lessons`: query paralel + cache materi koleksi terbit (±50 menit) | `routes/lessons.py` |
| B6 | Backoff polling worker saat antrean kosong (0,5 → 2 s) | `worker.py` |
| B8 | Panduan polling frontend: 1 s × 10, lalu 2 s | `API.md` |
| — | Klien Supabase pool HTTP/1.1 (bug §3) | `core/supabase_client.py` |

Belum: bucket katalog publik + CDN (B7), menunggu kesepakatan dengan frontend.
