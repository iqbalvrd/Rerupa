# Handoff & Progres — Rerupa

Dokumen hidup untuk melacak progres **backend (Iqbal)** dan **frontend (Xavier)**, serta titik serah-terima di antaranya. Perbarui setiap selesai satu bagian kerja.

Terakhir diperbarui: setelah pipeline CV Fase 2 dibangun dan dievaluasi.

Legenda: ✅ selesai · 🟡 sedang dikerjakan · ⏳ belum mulai · ⛔ terhambat

Acuan: [PRD v1.3](PRD_Rerupa_v1.3.md) · [Rencana v1.2](RENCANA_PENGERJAAN.md) · [Arsitektur](SYSTEM_ARCHITECTURE.md) · [ERD](ERD.md) · [Panduan API untuk frontend](api/API.md)

---

## 1. Ringkasan status

| Fase | Backend (Iqbal) | Frontend (Xavier) |
| --- | --- | --- |
| 1. Fondasi | ✅ | ⏳ |
| 2. Galeri & CV | 🟡 galeri ✅, pipeline CV ✅, uji foto HP asli ⏳ | ⏳ |
| 3. Tahapan | ⏳ | ⏳ |
| 4. Mode bebas & warna | 🟡 unggah + job ✅, pipeline ⏳ | ⏳ |
| 5. Checkpoint | ⏳ | ⏳ |
| 6. Rilis versi awal | ⏳ | ⏳ |
| 7. Penguatan showcase | ⏳ | ⏳ |
| 8. P1 storyline | ⏳ | ⏳ |
| 9. Demo | ⏳ | ⏳ |

---

## 2. Backend (Iqbal)

### 2.1 Sudah selesai

| Bagian | Detail | Bukti |
| --- | --- | --- |
| Setup | Proyek `api/` (uv, Python 3.12), config `.env`, log JSON, error terstandar `{code, message}` | `GET /health` → Supabase ok |
| Database | 9 migrasi diterapkan ke Supabase: 17 enum, 13 tabel, fungsi antrean, 3 bucket privat, indeks FK | `supabase/migrations/` |
| Keamanan DB | RLS aktif di semua tabel tanpa policy publik; `anon`/`authenticated` tanpa hak tabel; hanya backend (service role) yang akses | Advisor keamanan Supabase bersih |
| Sesi tamu | `POST/GET/PATCH/DELETE /sessions`; token di cookie httpOnly, DB simpan hash; sesi lain → 404; hapus sesi mencabut akses, membatalkan job antre, menghapus file foto | Tes integrasi |
| Antrean job | Idempoten (`Idempotency-Key`), klaim atomik, job macet dicoba ulang lalu gagal, job sesi terhapus tidak diproses; `GET /jobs/{id}` | Tes integrasi |
| Unggahan | Cek isi file (magic bytes), ≤10 MB, ≤25 MP, orientasi diperbaiki, **semua metadata termasuk GPS dibuang**, simpan privat | Tes unit + integrasi |
| Mode bebas (kerangka) | `POST /lessons/generate` menerima foto → job. Sementara berakhir `failed` / `pipeline_not_ready` | Tes integrasi |
| Galeri | `GET /artworks`, `GET /artworks/{slug}`: hanya karya terbit, signed URL, sumber | Tes integrasi |
| Tes | 37 tes (unit + integrasi ke Supabase, data uji dibersihkan otomatis) | `uv run pytest` |
| Serah-terima | `api/API.md` + `api/examples/*.json` (tervalidasi terhadap model respons) + draf bentuk tutorial | — |
| Pipeline CV (Fase 2) | `api/cv/`: normalisasi, cek kualitas, mask (rembg u2net), garis (TEED untuk mode bebas, model lineart untuk koleksi, XDoG cadangan) dengan ambang adaptif, region k-means ≤35 yang digabung berdasarkan kemiripan warna, terang-gelap 3–5 tingkat, SVG + gambar region bernomor | 59 tes + evaluasi foto nyata ([eval/HASIL_FASE2.md](eval/HASIL_FASE2.md)) |

### 2.2 Berikutnya

| Prioritas | Pekerjaan | Fase | Membuka untuk frontend |
| --- | --- | --- | --- |
| 1 | Uji CV dengan foto HP sungguhan dari lukisan fisik (menggantikan simulasi) | 2 | — |
| 2 | Contoh lesson JSON + SVG nyata dari pipeline untuk Xavier | 2 | `StageCanvas` dengan data nyata |
| 3 | Tabel lesson (`lesson_versions`, `regions`, `stages`, …) + `stage_planner` | 3 | `GET /lessons/{id}` nyata |
| 4 | Integrasi OpenAI teks per tahap + validator + templat cadangan | 3 | Teks tahap nyata |
| 5 | Impor materi koleksi pertama | 3 | Galeri berisi data nyata |
| 6 | Resep warna Mixbox (perkiraan) + mode bebas end-to-end | 4 | `GET /recipes`, job `succeeded` |
| 7 | Checkpoint: tap 4 sudut, ECC, metrik, feedback | 5 | `POST /sessions/{id}/checkpoints` |

### 2.3 Belum ada / catatan teknis

- Rate limit per IP (Fase 6).
- Retensi otomatis 24 jam untuk foto yang sesinya tidak dihapus (Fase 7). Foto sesi yang dihapus sudah langsung dihapus.
- Handler AI yang berjalan >2 menit perlu heartbeat agar tidak dianggap macet (Fase 3).
- OpenAI belum dikonfigurasi (`OPENAI_API_KEY` kosong); `DATABASE_URL` belum diisi (belum dibutuhkan).
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
| Galeri + detail karya | `GET /artworks`, `GET /artworks/{slug}` (data masih kosong → pakai [contoh](api/examples/artworks_list.json)) | ⏳ |
| Mulai/pulihkan/hapus sesi | `POST/GET/PATCH/DELETE /sessions` | ⏳ |
| Layar unggah mode bebas + kamera + persetujuan kirim foto ke AI | `POST /lessons/generate` (multipart, `Idempotency-Key`) | ⏳ |
| Layar status job (polling tiap 1 detik) | `GET /jobs/{id}` | ⏳ |
| `StageCanvas` SVG, slider, toggle lapisan, foto asli + zoom | Draf [lesson_detail.draft.json](api/examples/lesson_detail.draft.json) | ⏳ |

### 3.3 Menunggu backend

| Pekerjaan | Menunggu |
| --- | --- |
| Ruang latihan dengan data nyata | `GET /lessons/{id}` (Fase 3) |
| Kartu resep warna | `GET /recipes/{id}` (Fase 4) |
| Penanda tahap selesai | `PATCH /sessions/{id}/progress` (Fase 5) |
| Checkpoint UI + tap 4 sudut | `POST /sessions/{id}/checkpoints` (Fase 5) |

---

## 4. Titik serah-terima

| Dari → Ke | Apa | Status |
| --- | --- | --- |
| Backend → Frontend | Panduan API + contoh respons | ✅ `api/API.md`, `api/examples/` |
| Backend → Frontend | Draf bentuk `GET /lessons/{id}` | ✅ draf (bisa berubah di Fase 3) |
| Backend → Frontend | `GET /lessons/{id}` nyata + SVG lapisan | ⏳ Fase 3 |
| Backend → Frontend | URL API produksi | ⏳ Fase 6 |
| Frontend → Backend | Domain Vercel untuk `FRONTEND_ORIGIN` (CORS) | ⏳ |
| Frontend → Backend | Masukan bentuk JSON lesson setelah mencoba draf | ⏳ |
| Xavier → Iqbal | Undangan ke project OpenAI + akses Playground | ⏳ |
| Tim → Backend | Kesepakatan pembagian modul backend (usul: sesi & progres oleh Xavier) | ⏳ |
| Konten → Backend | 1 materi koleksi + lisensi + 5–10 entri basis budaya + palet demo | ⏳ |

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
| `feat/fase-2-cv` | Fase 2: pipeline CV + evaluasi | Lokal, belum di-push |
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
| Backend Fase 2 | Pipeline CV + evaluasi di foto nyata; metode dipilih (TEED/u2net), 4 perbaikan dari hasil uji, retry Storage, 59 tes |
