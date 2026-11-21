# Sisa kerja frontend (Xavier)

Per 21 Nov 2026, malam. Target versi awal: **26–27 Nov**.

## Sudah selesai (masuk `main`)

| Bagian | PR |
| --- | --- |
| Fondasi: Next.js, klien API, sesi, polling job | #10 |
| Galeri museum 3D + logo | #11 |
| Detail karya + transisi "mendekat ke lukisan" | #12 |
| Persiapan + mock API dev | #13 |
| Ruang latihan (StageCanvas, lapisan, resep warna, progres) | #14 |
| Checkpoint (foto, tap 4 sudut, feedback) | #15 |

Sudah dites dengan **API asli**: unggah → tutorial jadi sekitar 10 detik → Persiapan → ruang latihan dengan region asli.

---

## 1. Wajib sebelum 27 Nov

| # | Kerjaan | Perkiraan | Catatan |
| --- | --- | --- | --- |
| 1 | **Commit + PR Unggah mode bebas** | 15 menit | Sudah jadi dan sudah dites dengan API asli. Masih di branch `feat/web-upload`, belum di-commit |
| 2 | **Halaman Selesai** (`/selesai`) | 1–2 jam | Rangkuman tahap, refleksi budaya (`reflection` + event `reflection_answered`), latihan lain, hapus sesi (`DELETE /sessions/{id}`). Tombol di tahap terakhir sudah mengarah ke sini |
| 3 | **Deploy web ke Vercel** | ±1 jam | Kirim domain Vercel ke Iqbal untuk `FRONTEND_ORIGIN`. Butuh backend sudah di-deploy ke Railway |
| 4 | **Tes di HP sungguhan** (Android Chrome + iPhone Safari) | 1–2 jam | Kamera, geser sudut dan kotak potong, galeri 3D, transisi, cookie sesi lintas domain di iPhone |
| 5 | **Tes alur lengkap dengan API asli** | ±1 jam | Materi koleksi (butuh karya terbit), checkpoint dengan foto progres nyata, resep warna |

## 2. Bukan kode, tapi bagianku

| # | Kerjaan | Ke siapa |
| --- | --- | --- |
| 1 | Pasang **batas pengeluaran** di dashboard OpenAI | Sendiri (tugas Xavier di `HANDOFF.md §4`) |
| 2 | **Ganti key OpenAI**: key lama pernah ditempel di chat | Sendiri, lalu kabari Iqbal |
| 3 | Minta **minimal 1 karya diterbitkan** (`import_collection.py … --publish`) | Iqbal / Sheva |
| 4 | Kirim domain Vercel untuk CORS | Iqbal |
| 5 | Ikut uji 5–8 pengguna + rekam video demo | Tim |

## 3. Polish (setelah alur inti aman, atau masuk showcase)

| # | Kerjaan | Perkiraan | Catatan |
| --- | --- | --- | --- |
| 1 | **Landing 3D museum** (port `landing_prototype_v3.html`) | ±1 hari | `LANDING_SPEC.md` menyarankan versi statis dulu kalau mepet. Model gajah masih keputusan tim |
| 2 | **Tahap yang padat**: di tahap "Objek utama" bisa muncul 19 nomor sekaligus | 1–2 jam | Kecilkan nomor atau tambah toggle "Nomor"; bisa juga dibahas di `stage_planner` dengan Iqbal |
| 3 | Pemilih gaya bingkai + favicon dari logo | 1–2 jam | Gaya Louis XVI sudah disiapkan di `frames.ts` |
| 4 | Transisi saat tombol back bawaan browser / gestur HP | 1–2 jam | Sekarang animasi hanya lewat tombol "← Galeri" atau `Esc` |
| 5 | Audit aksesibilitas + update `HANDOFF.md §3` (bagian frontend) | 1–2 jam | `HANDOFF.md §3` masih kosong |

---

## Cara jalanin lokal (tanpa mock)

Tiga terminal:

```bash
cd ~/Desktop/xav/Rerupa/api && uv run uvicorn main:app --reload
```

```bash
cd ~/Desktop/xav/Rerupa/api && uv run python worker.py
```

```bash
cd ~/Desktop/xav/Rerupa/web && npm run dev
```

Mode mock (tanpa backend): tambahkan `NEXT_PUBLIC_API_MOCK=1` di `web/.env.local`.

## Langkah berikutnya

Commit + PR Unggah mode bebas (15 menit), lalu kerjakan halaman Selesai.
