# Analisa bug, optimasi, dan rencana deploy

Tanggal: 21 Nov 2026 · cakupan: backend `api/` (API + worker) setelah Fase 1–7 + uji model OpenAI. **Fase 8 (storyline P1) belum dikerjakan.**

## Angka hasil ukur (laptop, sebagai patokan)

| Ukuran | Nilai |
| --- | --- |
| Waktu start API (`import main`) | **7,3 s**, 4,2 s di antaranya memuat `colour-science` (+ scipy, matplotlib) |
| Memori API | ±144 MB |
| Memori worker setelah model (TEED + u2net) | ±570 MB; puncak saat CV **±1,2 GB** |
| Pemuatan model saat worker start | 23–70 s |
| CV satu foto | 3–8 s, padahal job utuh 12–15 s → sisanya bolak-balik database/Storage |
| Latensi laptop → Supabase (Tokyo) | 113–246 ms per query |
| Query berurutan per `GET /lessons/{id}` | ±11 (sesi, lesson, lapisan, region, tahap, klaim, refleksi, signed URL, palet, saran warna, cat) |

## A. Bug (perilaku salah)

| # | Masalah | Dampak | Perbaikan |
| --- | --- | --- | --- |
| A1 | Job yang lewat batas waktu hanya digagalkan **oleh worker** (`fail_overdue` di loop worker). Bila worker mati/crash, job tetap `queued` selamanya | Layar "Membuat tutorial" berputar tanpa akhir | Pindahkan `fail_overdue` + `requeue_stale_jobs` ke **pg_cron tiap 1 menit** (murni DB), dan/atau `GET /jobs` menghitung status terlambat saat dibaca |
| A2 | Worker tidak menangani **SIGTERM**. Saat redeploy, job yang sedang diproses mati; baru diantrekan ulang setelah 120 s, padahal batas gagal 75 s | Setiap deploy saat ada pengguna → tutorial/feedback mereka gagal | Tangkap SIGTERM: berhenti mengambil job baru, selesaikan job berjalan; bila tak sempat, kembalikan job ke `queued`. Set *draining* Railway 60 s |
| A3 | Rate limit **per IP** 120/menit & unggah 30/jam. Uji pengguna 5–8 orang di **satu Wi-Fi** = satu IP; polling `/jobs` tiap 1 s × 8 orang ≈ 480/menit | Peserta uji kena 429 bersamaan | Naikkan per IP (mis. 600/menit, unggah 80/jam); batas per **sesi** sudah menahan penyalahgunaan per orang |
| A4 | Dockerfile: model diunduh **setelah** `COPY . .` → setiap perubahan kode mengunduh ulang ±350 MB dari Hugging Face (tanpa token, bisa kena rate limit) | Deploy lambat; build bisa gagal karena HF | Unduh model di lapisan sendiri sebelum menyalin kode |
| A5 | Retensi lapisan memakai filter `in.(…)` berisi semua unggahan kedaluwarsa 8 hari | Saat ribuan unggahan, URL query terlalu panjang → retensi gagal diam-diam | Ganti dengan fungsi SQL (RPC) |

## B. Pemborosan (lambat / berat)

| # | Masalah | Perbaikan | Perkiraan hasil |
| --- | --- | --- | --- |
| B1 | API memuat `color.mixer` (colour-science, scipy, matplotlib) hanya untuk `GET /palettes` yang cuma membaca DB | Impor malas di `color/palettes.py` | Start API 7,3 s → ±3 s; API tidak butuh paket CV sama sekali → image API kecil |
| B2 | **Satu image** (torch + model, ±2–2,5 GB) dipakai juga oleh API | Dua image: API ramping (±250 MB) dan worker (torch CPU + model) | Deploy API dalam detik; RAM API 256–512 MB cukup |
| B3 | Worker memproses **satu job sekaligus**; selama menunggu OpenAI (±18 s) CPU menganggur | Worker 2 thread (`WORKER_CONCURRENCY=2`) | Kapasitas ±2× tanpa tambah mesin. Saat ini 1 worker ≈ 2 tutorial/menit → 8 peserta serentak sudah mengantre >2 menit dan **kena batas 60 s** |
| B4 | Unggah 7 lapisan tutorial **berurutan** | Unggah paralel (thread pool) | ±2–4 s lebih cepat per tutorial |
| B5 | `GET /lessons` ±11 query berurutan | Jalankan query paralel; **cache** respons materi koleksi di memori API (versi lesson tidak berubah) | Galeri/tutorial koleksi dari ±1–2 s → <0,3 s |
| B6 | Worker menganggur tetap memanggil `claim_job` 2× tiap 0,5 s (±350 rb request/hari ke Supabase) | Backoff saat antrean kosong (0,5 → 2 s) | Beban DB idle turun ±4× |
| B7 | Gambar & lapisan koleksi lewat signed URL baru di tiap request | Bucket katalog **publik** untuk materi terbit (domain publik) + `Cache-Control` panjang pada path berversi | Browser/CDN bisa cache; satu panggilan Storage lebih sedikit |
| B8 | Frontend polling `/jobs` tiap 1 s selama 15–40 s | Polling bertahap (1 s × 10, lalu 2 s) | Request polling −40% |

## C. Rencana deploy yang ringan dan mulus

### Arsitektur

```
Pengguna (Indonesia)
   │
   ├── Vercel (frontend, CDN global)
   └── API ramping  ── 1 instance, 0,5 vCPU / 512 MB, tanpa torch
          │
          ├── Supabase (DB + Storage)   ← satu region dengan API & worker
          └── Worker CV ── 1 instance always-on, 2 vCPU / 2–3 GB, torch CPU + model tertanam di image
```

### Keputusan utama

1. **Satu region untuk semua.** ✅ **Sudah dikerjakan (21 Nov):** database dipindah ke project Supabase baru di **Singapura** (`ap-southeast-1`); latensi laptop → DB turun dari 113–246 ms ke 45–59 ms per query. Catatan awal: Supabase dulu di **Tokyo**, sedangkan Railway hanya punya Singapura untuk Asia. Tiap request API melakukan 3–11 query berurutan, jadi jarak API ↔ DB dikali 3–11.
   - **Terbaik:** buat project Supabase baru di **Singapura** (`ap-southeast-1`) selagi data masih kecil. Migrasi tinggal diulang dari `supabase/migrations/`, konten diimpor ulang dengan skrip. Hasilnya pengguna, API, worker, dan DB semua di Singapura.
   - Alternatif: tetap Tokyo, deploy di Fly.io region Tokyo (`nrt`). Pengguna Indonesia → Tokyo ±70–90 ms, tapi API ↔ DB dekat.
2. **Dua image.** `Dockerfile.api` (dependensi dasar saja) dan `Dockerfile.worker` (grup `cv` + model dipanggang lebih dulu). Deploy kode API tidak lagi menyentuh torch.
3. **Worker selalu menyala dan siap.** Tanpa sleep/scale-to-zero (pemuatan model 23–70 s). Healthcheck worker lewat log/heartbeat; `/health` API sudah melaporkan antrean.
4. **Deploy tanpa memutus pengguna.** SIGTERM ditangani (A2), *draining* 60 s, pg_cron menangani job macet (A1), healthcheck API `/health`.
5. **Ukuran mesin awal** (cukup untuk uji pengguna 5–10 orang): API 0,5 vCPU / 512 MB; worker 2 vCPU / 3 GB dengan 2 thread. Bila antrean `/health` > 30 s saat uji, tambah 1 worker (klaim job sudah aman untuk banyak worker).
6. **Rahasia:** key OpenAI dan Supabase yang pernah ditempel di chat diganti sebelum produksi.

### Urutan pengerjaan yang disarankan

| Prioritas | Pekerjaan | Kenapa dulu |
| --- | --- | --- |
| 1 | A1 + A2 + A3 | Mencegah kegagalan yang langsung terlihat saat uji pengguna/demo |
| 2 | B1 + B2 + A4 (dua image, impor malas, lapisan model) | Deploy jadi ringan dan cepat |
| 3 | B3 + B4 (worker 2 thread, unggah paralel) | Kapasitas & waktu tunggu tutorial |
| 4 | Pindah Supabase ke Singapura (keputusan tim, butuh project baru) | Latensi semua request |
| 5 | B5–B8, A5 | Penghalusan |
