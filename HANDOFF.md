# Handoff & Progres — Rerupa

Dokumen hidup untuk melacak progres **backend (Iqbal)** dan **frontend (Xavier)**, serta titik serah-terima di antaranya. Perbarui setiap selesai satu bagian kerja.

Terakhir diperbarui: setelah Fase 7 backend (penguatan showcase) selesai.

Legenda: ✅ selesai · 🟡 sedang dikerjakan · ⏳ belum mulai · ⛔ terhambat

Acuan: [PRD v1.3](PRD_Rerupa_v1.3.md) · [Rencana v1.2](RENCANA_PENGERJAAN.md) · [Arsitektur](SYSTEM_ARCHITECTURE.md) · [ERD](ERD.md) · [Panduan API untuk frontend](api/API.md)

---

## 1. Ringkasan status

| Fase | Backend (Iqbal) | Frontend (Xavier) |
| --- | --- | --- |
| 1. Fondasi | ✅ | ⏳ |
| 2. Galeri & CV | 🟡 galeri ✅, pipeline CV ✅, uji foto HP asli ⏳ | ⏳ |
| 3. Tahapan | ✅ (teks AI menunggu API key; templat jalan) | ⏳ |
| 4. Mode bebas & warna | ✅ (palet masih referensi digital; resep teruji fisik menyusul) | ⏳ |
| 5. Checkpoint | 🟡 end-to-end ✅ (foto sintetis); uji 3–5 foto progres nyata ⏳; feedback AI menunggu key | ⏳ |
| 6. Rilis versi awal | 🟡 siap deploy (Dockerfile, rate limit, batas biaya, smoke test) ✅; deploy Railway + batas OpenAI di dashboard ⏳ (butuh akun) | ⏳ |
| 7. Penguatan showcase | 🟡 2 checkpoint, retensi 24 jam, tes akses antar-sesi, P95 lokal ✅; 3–5 materi + resep teruji fisik (konten) ⏳; P95 produksi ⏳ | ⏳ |
| 8. P1 storyline | ⏳ | ⏳ |
| 9. Demo | ⏳ | ⏳ |

---

## 2. Backend (Iqbal)

### 2.1 Sudah selesai

| Bagian | Detail | Bukti |
| --- | --- | --- |
| Setup | Proyek `api/` (uv, Python 3.12), config `.env`, log JSON, error terstandar `{code, message}` | `GET /health` → Supabase ok |
| Database | 13 migrasi diterapkan ke Supabase: 17 enum, 13 tabel, fungsi antrean, 3 bucket privat, indeks FK | `supabase/migrations/` |
| Keamanan DB | RLS aktif di semua tabel tanpa policy publik; `anon`/`authenticated` tanpa hak tabel; hanya backend (service role) yang akses | Advisor keamanan Supabase bersih |
| Sesi tamu | `POST/GET/PATCH/DELETE /sessions`; token di cookie httpOnly, DB simpan hash; sesi lain → 404; hapus sesi mencabut akses, membatalkan job antre, menghapus file foto | Tes integrasi |
| Antrean job | Idempoten (`Idempotency-Key`), klaim atomik, job macet dicoba ulang lalu gagal, job sesi terhapus tidak diproses; `GET /jobs/{id}` | Tes integrasi |
| Unggahan | Cek isi file (magic bytes), ≤10 MB, ≤25 MP, orientasi diperbaiki, **semua metadata termasuk GPS dibuang**, simpan privat | Tes unit + integrasi |
| Mode bebas | `POST /lessons/generate` (+ `scope` potong satu figur) → worker: CV → `stage_planner` → teks → simpan atomik → `GET /lessons/{id}`. Foto buram/polos → `needs_retake` | Tes integrasi end-to-end |
| Galeri | `GET /artworks`, `GET /artworks/{slug}`: hanya karya terbit, signed URL, sumber | Tes integrasi |
| Tes | 37 tes (unit + integrasi ke Supabase, data uji dibersihkan otomatis) | `uv run pytest` |
| Serah-terima | `api/API.md` + `api/examples/*.json` (tervalidasi terhadap model respons) + draf bentuk tutorial | — |
| Tahapan (Fase 3) | 9 tabel tutorial + fungsi `create_lesson` atomik; `stage_planner` (6–8 tahap, tiap region tepat sekali, ≤10 region per tahap bila muat, checkpoint di tahap sketsa); lapisan AI (prompt, structured output, validator aturan PRD, retry 1×, templat cadangan, catat biaya, batas harian); heartbeat worker + pemuatan model saat start; skrip impor koleksi + 1 contoh (Raden Saleh, draf) | 105 tes |
| Warna (Fase 4) | `color/`: Mixbox + ΔE2000, 1–3 cat + campuran tint (putih 5–24 bagian), resep teruji diutamakan, tips koreksi; saran warna tiap region tersimpan atomik bersama lesson; `GET /palettes`, `GET /recipes/{id}`, `region_colors` di `GET /lessons/{id}`; cache foto identik per sesi; palet referensi digital (sementara) | 123 tes |
| Checkpoint (Fase 5) | `PATCH/GET /sessions/{id}/progress` (melihat ≠ menyelesaikan), `POST/GET /sessions/{id}/checkpoints`; tap 4 sudut → warp → ECC ke **grid** (cadangan: ke garis target, translasi ≤3%) → metrik per bentuk (garis tergambar, geser, lebar/tinggi; tahap warna: % terisi, ΔL*) → maks 3 kandidat → maks 2 saran (AI dari kandidat saja, templat cadangan); foto buram/gelap/sudut salah/sketsa tak terlihat → `needs_retake` tanpa saran; kuota 1 retry per checkpoint; event analitik (`POST /events` + event server); materi koleksi bisa dipasang ke sesi (`lesson_version_id`) | 160 tes, job ±6–8 s |
| Rilis (Fase 6) | Rate limit per IP/sesi/buat sesi/unggah (429 + `Retry-After`); cek origin untuk permintaan yang mengubah data; header keamanan; batas tunggu job 60/45 s → `worker_timeout` (tidak memakan kuota); cek konfigurasi produksi saat start; `/health` melaporkan antrean; alarm biaya 50/80/100%; Dockerfile (torch CPU, bobot model di-cache saat build) + `railway.toml` + [DEPLOY.md](api/DEPLOY.md); `scripts/smoke.py` alur lengkap lulus di lokal | Tes + smoke test |
| Showcase (Fase 7) | 2 checkpoint (sketsa + bidang sedang; tahap warna diselaraskan dengan tepi bidang warna); retensi: worker tiap 15 menit hapus foto + lapisan turunan foto >24 jam dan sesi terhapus/kedaluwarsa, `pg_cron` untuk `events`/`ai_usage`; lapisan terhapus → `purged: true`; tes otomatis akses antar-sesi/hapus sesi/idempotensi/retensi; `scripts/measure_p95.py` + `scripts/report_ai.py` | P95 lokal (20 putaran): tutorial 29,0 s, feedback 15,0 s — [eval/P95_LOKAL.md](eval/P95_LOKAL.md) |
| AI OpenAI | Uji 3 model pada 4 materi koleksi ([eval/HASIL_UJI_MODEL.md](eval/HASIL_UJI_MODEL.md)): **gpt-6.1-terra** dipilih untuk mode bebas + feedback (lolos validator 4/4, ±18 s, ±$0,012/tutorial), gpt-6.2-sol untuk impor koleksi; `reasoning.effort=low`; alur penuh dengan AI sungguhan terbukti (teks tahap + feedback, biaya tercatat di `ai_usage`) | Uji model + uji end-to-end |
| Pipeline CV (Fase 2) | `api/cv/`: normalisasi, cek kualitas, mask (rembg u2net), garis (TEED untuk mode bebas, model lineart untuk koleksi, XDoG cadangan) dengan ambang adaptif, region k-means ≤35 yang digabung berdasarkan kemiripan warna, terang-gelap 3–5 tingkat, SVG + gambar region bernomor | 59 tes + evaluasi foto nyata ([eval/HASIL_FASE2.md](eval/HASIL_FASE2.md)) |

### 2.2 Berikutnya

| Prioritas | Pekerjaan | Fase | Membuka untuk frontend |
| --- | --- | --- | --- |
| 2 | Uji checkpoint dengan 3–5 foto progres sketsa nyata (`eval/run_checkpoint.py`), kalibrasi ambang | 5 | — |
| 4 | Uji CV dengan foto HP sungguhan dari lukisan fisik | 2 | — |

### 2.3 Belum ada / catatan teknis

- Deploy belum dilakukan; Dockerfile belum pernah di-build (Docker tidak ada di laptop). Build pertama di Railway = uji Dockerfile.
- Worker butuh ±30–70 s memuat model saat start; job yang datang saat itu menunggu. Deploy minimal 2 menit sebelum uji/demo.
- Rate limit di memori proses → jalankan 1 instance API.
- iOS Safari bisa memblokir cookie lintas domain (Vercel ↔ Railway); bila terjadi, pakai subdomain yang sama untuk API.

- Checkpoint (sketsa + tahap warna) dikalibrasi dengan foto sintetis; ambang (`cv/compare.py`, `cv/checkpoint.py`) perlu disesuaikan setelah uji foto progres nyata.
- Materi koleksi yang diimpor sebelum Fase 7 (Raden Saleh v2) masih 1 checkpoint; impor ulang agar mendapat 2.
- Saat seluruh sketsa bergeser ke satu arah, saran saat ini menyebut per bentuk (bisa dua saran mirip); bisa digabung jadi satu saran setelah uji nyata.
- OpenAI aktif di lokal (`gpt-6.1-terra`). Key yang dipakai pernah ditempel di chat → **cabut dan ganti** sebelum deploy, lalu set batas pengeluaran di dashboard OpenAI. `DATABASE_URL` belum diisi (belum dibutuhkan).
- Checkpoint pada tutorial nyata: sketsa yang bergeser seluruhnya kadang terbaca sebagai "sisi bidang lebih lebar/sempit", atau tidak terdeteksi pada batik/lanskap (lihat HASIL_UJI_MODEL.md). Perlu deteksi pergeseran global + uji foto progres nyata.
- CV: lukisan utuh yang penuh tokoh terlalu rumit untuk 35 region — **UI perlu mengarahkan pemula memotong satu figur**. Waktu CV mode bebas ±6–12 s di CPU laptop (target 8 s), perlu diukur di server.

### 2.4 Catatan untuk frontend dari Fase 2

- Layar unggah mode bebas sebaiknya punya langkah **potong area** (satu figur). Backend menerima `scope` sebagai pecahan `{x, y, w, h}` 0–1 dari foto.
- Lapisan garis berupa **PNG transparan** (bukan SVG) seukuran gambar; region, sketsa, objek utama, dan terang-gelap berupa SVG. Semuanya memakai `viewBox` yang sama.

---

## 3. Frontend (Xavier)

> Bagian ini diisi/diperbarui Xavier.

### 3.1 Sudah selesai

| Bagian | Detail | Catatan |
| --- | --- | --- |
| — | — | — |

### 3.2 Bisa dikerjakan sekarang (API sudah siap)

| Pekerjaan | Endpoint / bahan | Status |
| --- | --- | --- |
| Scaffold Next.js + layout mobile-first | — | ⏳ |
| Klien API (`credentials: "include"`, penanganan error `{code, message}`) | [API.md](api/API.md) | ⏳ |
| Galeri + detail karya | `GET /artworks`, `GET /artworks/{slug}` (galeri masih kosong; 1 contoh berstatus draf → pakai [contoh](api/examples/artworks_list.json)) | ⏳ |
| Mulai/pulihkan/hapus sesi | `POST/GET/PATCH/DELETE /sessions` | ⏳ |
| Layar unggah mode bebas + kamera + persetujuan kirim foto ke AI + **potong satu figur** (`scope`) | `POST /lessons/generate` (multipart, `Idempotency-Key`) | ⏳ |
| Layar "Membuat tutorial" (polling tiap 1 detik, teks per `progress.step`) | `GET /jobs/{id}` | ⏳ |
| Layar Persiapan: pilih palet | `GET /palettes` → `PATCH /sessions/{id}` `palette_id` | ⏳ |
| Kartu resep warna per region (label perkiraan/sulit/teruji, swatch `mixed_hex`, cat + bagian, tips) | `region_colors` di `GET /lessons/{id}` | ⏳ |
| Mulai latihan materi koleksi | `lesson_version_id` dari `GET /artworks` → `POST /sessions` atau `PATCH /sessions/{id}` | ⏳ |
| Penanda tahap dilihat/selesai + pulihkan progres | `PATCH/GET /sessions/{id}/progress` — [contoh](api/examples/progress.json) | ⏳ |
| Penanda "foto sudah dihapus otomatis" untuk lapisan `purged: true` (setelah 24 jam) | `GET /lessons/{id}` | ⏳ |
| Checkpoint UI: panduan memotret, **tap 4 sudut bidang grid**, status, feedback + penanda `bbox`, lewati checkpoint | `POST/GET /sessions/{id}/checkpoints` — [contoh](api/examples/checkpoint_feedback.json), [foto ulang](api/examples/checkpoint_retake.json) | ⏳ |
| Event analitik (lesson_viewed, recipe_opened, original_photo_opened, feedback_shown, reflection_answered) | `POST /events` | ⏳ |
| `StageCanvas` SVG, slider, toggle lapisan, foto asli + zoom ke `focus_bbox` | **`GET /lessons/{id}` nyata** — [contoh](api/examples/lesson_detail.json), cara membaca di [API.md](api/API.md#membaca-get-lessonsid) | ⏳ |

### 3.3 Menunggu backend

| Pekerjaan | Menunggu |
| --- | --- |
| — | — |

---

## 4. Titik serah-terima

| Dari → Ke | Apa | Status |
| --- | --- | --- |
| Backend → Frontend | Panduan API + contoh respons | ✅ `api/API.md`, `api/examples/` |
| Backend → Frontend | `GET /lessons/{id}` nyata + SVG/PNG lapisan | ✅ Fase 3 |
| Backend → Frontend | URL API produksi | ⏳ setelah deploy Railway ([DEPLOY.md](api/DEPLOY.md)) |
| Tim → Backend | Akun/proyek Railway (region Singapura) untuk deploy `api` + `worker` | ⏳ |
| Xavier → Tim | Batas pengeluaran di dashboard OpenAI | ⏳ |
| Frontend → Backend | Domain Vercel untuk `FRONTEND_ORIGIN` (CORS) | ⏳ |
| Frontend → Backend | Masukan bentuk JSON lesson setelah mencoba draf | ⏳ |
| Xavier → Iqbal | Key OpenAI | ✅ diterima (harus diganti sebelum deploy) |
| Tim → Backend | Kesepakatan pembagian modul backend (usul: sesi & progres oleh Xavier) | ⏳ |
| Konten → Backend | 1 materi koleksi + lisensi + 5–10 entri basis budaya + palet demo (format di [content/README.md](content/README.md); contoh Raden Saleh sudah ada sebagai draf) | ⏳ |
| Konten → Backend | Tinjau contoh Raden Saleh lalu terbitkan (`--publish`) | ⏳ |
| Konten → Backend | Palet cat demo asli: swatch kering difoto dengan kartu abu-abu → `content/palettes/*.json`; 3–5 resep teruji fisik | ⏳ |

---

## 5. Kontrak yang disepakati

| Hal | Kesepakatan |
| --- | --- |
| Basis URL | `NEXT_PUBLIC_API_BASE_URL` (lokal `http://localhost:8000`) |
| Sesi | Cookie httpOnly `rerupa_session`; frontend selalu `fetch(..., { credentials: "include" })` |
| Idempotensi | Header `Idempotency-Key` = UUID baru per aksi pengguna, sama saat retry |
| Error | `{ "error": { "code", "message" } }`; tampilkan `message`, logika pakai `code` |
| Status job | Polling `GET /jobs/{id}` tiap 1 detik sampai `is_final: true` |
| Koordinat | Semua lapisan SVG memakai ruang `image_width × image_height` dari lesson |
| Cookie produksi | Backend set `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `FRONTEND_ORIGIN` = domain Vercel |

---

## 6. Branch

| Branch | Isi | Status |
| --- | --- | --- |
| `main` | Dokumen (PRD, rencana, ERD, arsitektur) | Di GitHub |
| `chore/api-setup` | Setup `api/` | Di GitHub, PR belum dibuat |
| `feat/db-schema` … `feat/api-artworks` | Fase 1 backend | Sudah di-merge ke `main` (PR #2) |
| `feat/fase-2-cv` | Fase 2: pipeline CV + evaluasi | Sudah di-merge ke `main` (PR #3) |
| `feat/fase-3-tahapan` | Fase 3: tahapan tutorial end-to-end | Sudah di-merge ke `main` (PR #4) |
| `feat/fase-4-warna` | Fase 4: saran campuran warna | Sudah di-merge ke `main` (PR #5) |
| `feat/fase-5-checkpoint` | Fase 5: progres + checkpoint foto progres | Sudah di-merge ke `main` (PR #6) |
| `feat/fase-6-rilis` | Fase 6: persiapan rilis + deploy | Sudah di-merge ke `main` (PR #7) |
| `feat/fase-7-showcase` | Fase 7: penguatan showcase + 4 materi koleksi | Sudah di-merge ke `main` (PR #8) |
| `feat/ai-model-openai` | Uji & aktivasi model OpenAI | Lokal, belum di-push |
| `feat/web-…` | Frontend | Dibuat Xavier |

---

## 7. Cara menjalankan

Backend:
```bash
cd api && uv sync --group cv && uv run uvicorn main:app --reload
```
Worker (terminal lain):
```bash
cd api && uv run python worker.py
```
Tes:
```bash
cd api && uv run pytest
```
Dokumentasi interaktif: `http://localhost:8000/docs`

---

## 8. Log perubahan

| Bagian | Ringkasan |
| --- | --- |
| Backend Fase 1 | Skema DB + keamanan, sesi tamu, antrean job + worker, unggahan aman, galeri, 37 tes, panduan API |
| Backend Fase 7 | 2 checkpoint, retensi 24 jam otomatis, bukti tes akses antar-sesi & penghapusan, ukur P95 + laporan AI |
| Backend Fase 6 | Siap rilis: rate limit, cek origin, batas waktu job, cek konfigurasi produksi, image deploy + panduan Railway, smoke test |
| Backend Fase 5 | Progres tahap, checkpoint foto progres (pelurusan grid + ECC, metrik sketsa/warna, maks 2 saran dari kandidat), event analitik, materi koleksi bisa dipasang ke sesi |
| Backend Fase 4 | Saran campuran warna per region (Mixbox + ΔE2000 + tint), API palet & resep, cache foto identik, palet referensi digital, 123 tes |
| Backend Fase 3 | Tutorial end-to-end (CV → tahapan → teks → simpan atomik → GET /lessons), lapisan AI siap pakai menunggu key, impor koleksi, 105 tes |
| Backend Fase 2 | Pipeline CV + evaluasi di foto nyata; metode dipilih (TEED/u2net), 4 perbaikan dari hasil uji, retry Storage, 59 tes |
