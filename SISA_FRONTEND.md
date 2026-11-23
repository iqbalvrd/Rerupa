# Handoff Xavier (frontend `web/`)

Per **23 Nov 2026, sore**. Target versi awal: **26–27 Nov**. Dokumen pribadi Xavier untuk memulai sesi Claude baru. Baca sampai habis sebelum kerja.

---

## 0. Cara kerja dengan Xavier (wajib diikuti)

| Hal | Preferensi |
| --- | --- |
| Bahasa | Xavier nulis Indonesia santai campur Inggris ("gua", "lu", "ts", "bole"). Balas dengan gaya yang sama, santai |
| Gaya jawaban | **Mode ADHD**: singkat, jelas, poin dulu. Jangan dinding teks, jangan basa-basi, jangan ulang yang sudah jelas |
| Skill | Pakai skill **modern-web-guidance** sebelum kerja HTML/CSS/JS. Pesan akhir tiap deliverable ditutup bagian `### Modern Web Guidance` (singkat; kalau giliran itu tidak menyentuh web, bilang tidak berlaku) |
| Commit / push / PR | **Jangan** commit, push, atau buka PR tanpa diminta. Setelah kerjaan selesai, tanya dulu |
| Review PR teman | Default: tulis komentar **di chat**, ditujukan per orang ("Buat Sheva", "Buat Iqbal"), siap dikirim lewat WhatsApp. **Jangan** posting ke GitHub kecuali diminta |
| Verifikasi | Selalu cek di browser pane (screenshot / read_page) sebelum bilang selesai. `npm run check` harus lulus |
| Bug visual | Cari penyebab dulu (matikan satu per satu), jangan tebak-tebakan. Revert edit debug sementara |
| Teks | Tanpa em dash di UI maupun dokumen. Teks UI Indonesia, hangat, pendek, kata kerja instruksi. Identifier kode, nama file, commit: Inggris |
| Rahasia | `api/.env`, `api/.env.prod`, `web/.env.local` berisi rahasia (service role Supabase, key OpenAI). **Jangan pernah cetak isinya**, jangan commit |
| Build | **Jangan** `npm run build` saat dev server jalan (menimpa `.next`). Pakai `npm run build:check` |
| Keputusan besar | Scope P0/P1, jumlah tahap, model, atau ubah dokumen orang lain: tanya dulu (`CLAUDERerupa.md §9`) |

## 1. Tim dan repo

- Repo: `iqbalvrd/Rerupa` (GitHub). Branch utama `main`. Push ke `main` = deploy otomatis Vercel (web) + Railway (api, worker).
- **Xavier**: frontend `web/`.
- **Iqbal**: backend `api/` (FastAPI, CV, worker, storyline). Dokumen dia: `HANDOFF.md`, `RENCANA_DEPLOY.md`, `api/API.md` (kontrak resmi), `api/DEPLOY.md`.
- **Sheva**: konten + aset landing 3D (patung, rumput, pohon, fasad). Branch `codex/*`. Sheva juga yang biasanya merge PR.
- Dokumen sumber kebenaran: `PRD_Rerupa_v1.3.md`, `RENCANA_PENGERJAAN.md`, `SYSTEM_ARCHITECTURE.md`, `ERD.md`, `LANDING_SPEC.md`, `CLAUDERerupa.md` (brief teknis + aturan budaya/privasi).

## 2. Status sekarang

### Sudah di `main` (23 Nov sore)

| Bagian | PR |
| --- | --- |
| Fondasi: Next.js, klien API, sesi, polling job | #10 |
| Galeri museum 3D + logo | #11 |
| Detail karya + transisi "mendekat ke lukisan" | #12 |
| Persiapan + mock API dev | #13 |
| Ruang latihan (StageCanvas, lapisan, resep warna, progres) | #14 |
| Checkpoint (foto, tap 4 sudut, feedback) | #15 |
| Unggah mode bebas | #16 |
| Selesai, landing 3D, pintu neoklasik, masuk galeri tanpa loading bertahap, galeri tanpa jendela | #26 |
| Storyline UI "Kisah di balik karya" (`/cerita/[id]`, alur agen riset) + jeda polling 1 s → 2 s | #27 |
| (Iqbal) Token sesi cadangan header `X-Session-Token` untuk Safari iOS (`web/lib/session-token.ts`) | #28 |
| (Iqbal) Agen riset storyline, alur pembuat → inspirasi → kisah → makna | #29 |
| (Sheva) Patung gajah perunggu (GLB sudah dikompres), fallback portrait tajam | #30 |
| (Sheva) Rumput rapat, pohon + bunga baru, fasad keraton + langit senja | #31–#34 |
| (Sheva) Bingkai emas adaptif dengan ukiran SVG, lalu dibuat setengah lebih tipis | #35, #38 |
| (Iqbal) Latihan memuat tutorial dari foto unggahan, bukan lesson lama | #36 |
| (Iqbal) Akun & admin (Supabase Auth, `web/lib/auth.ts`, `components/auth/*`): sesi latihan, unggah, checkpoint wajib login | #37 |
| Kartu "Cara kerja" di galeri, feedback Sheva, tipografi museum (Marcellus + Alegreya Sans) | #39 |

Lokal butuh `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `web/.env.local` agar tombol "Masuk" jalan (minta ke Iqbal).

Catatan: landing (`web/components/landing/*`, terutama `museum.tsx`, `sky.tsx`, `grass.tsx`, `door.tsx`, `scene-utils.ts`) sekarang banyak diubah Sheva. Sebelum ubah landing, `git pull` dan cek `git log -- web/components/landing` supaya tidak bentrok.

### Galeri jadi aula 3D (branch `feat/web-gallery-entrance`, PR terbuka)

Galeri sekarang aula ber-skylight (`web/components/gallery/room/*`), referensi: foto aula museum dari Xavier.

- Semua lukisan di satu dinding arcade yang menghadap pengunjung (3×2 di laptop, 2×3 di HP tegak; `planRoom` di `room/plan.ts`, dites). Tidak ada lukisan di dinding samping dan tidak ada "nengok" ala game: klik lukisan → kamera jalan pendek mendekat (pola landing). Panah/geser pindah lukisan, "Lihat semua"/Esc mundur.
- Bingkai 3D = desain Sheva digambar ke tekstur (`room/frame-texture.ts`, path SVG dan gradasi dari `frame-ornament.tsx`, tebal dari `frames.ts`).
- Tiap lukisan punya link HTML yang ditempel di atas lukisan (keyboard, screen reader, view transition ke halaman detail).
- Tanpa WebGL: galeri lama `museum-gallery.tsx` (pilihan di `gallery/gallery.tsx`).
- Bingkai Louis XIV/XVI berbasis gambar lama sudah dihapus (diganti bingkai SVG Sheva).

Riset rombak tutorial ada di `RISET_TUTORIAL.md` (belum dikerjakan, perlu dibahas dengan Iqbal).

Worktree lama storyline masih ada: `.claude/worktrees/web-storyline-9ed441` (branch `claude/web-storyline-9ed441`, sudah merge di #27). Boleh dibersihkan setelah Xavier setuju.

## 3. Sisa kerja

### Wajib sebelum 27 Nov

| # | Kerjaan | Catatan |
| --- | --- | --- |
| 1 | Merge PR aula 3D, cek di HP (berat? FPS?) | Lihat §2 |
| 2 | **Tes di HP sungguhan** (Android Chrome + iPhone Safari) di URL produksi | Kamera, sudut + kotak potong, landing 3D (berat? fallback?), transisi masuk galeri, sesi tetap ada setelah reload di iPhone (token header #28) |
| 3 | **Tes alur lengkap dengan API asli** | Galeri → detail → Persiapan → latihan → checkpoint (foto progres nyata) → Selesai → Kisah. Mode bebas: unggah → tutorial → cerita |
| 4 | Storyline di produksi | Butuh `FEATURE_STORY=true` (+ `FEATURE_RECOGNITION`) di Railway; tanya Iqbal statusnya |
| 5 | Isi `HANDOFF.md §3` (bagian frontend, masih kosong) | Ringkas tabel §2 di atas |

### Bukan kode, tapi bagian Xavier

| # | Kerjaan | Status |
| --- | --- | --- |
| 1 | Batas pengeluaran (monthly budget) di dashboard OpenAI | Belum dipastikan |
| 2 | Ganti key OpenAI (key lama pernah ditempel di chat), kabari Iqbal | Belum dipastikan |
| 3 | Lapor ke Iqbal: worker crash saat koneksi Supabase putus (`httpx.RemoteProtocolError ConnectionTerminated`), perlu sambung ulang otomatis | Sudah ada di draf WA, cek terkirim |
| 4 | Domain produksi Vercel: tanyakan URL pastinya ke Iqbal (deploy sudah jalan otomatis dari `main`) | Belum dicatat di sini |
| 5 | Pertimbangkan K2 (`rerupa.id` + `api.rerupa.id`) supaya cookie first-party; token di localStorage menghilangkan proteksi `httpOnly` | Opsional, `RENCANA_DEPLOY.md` |
| 6 | Uji 5–8 pengguna + rekam video demo | Tim |

### Polish (setelah alur inti aman)

| # | Kerjaan | Catatan |
| --- | --- | --- |
| 1 | Tahap padat: tahap "Objek utama" bisa 19 nomor sekaligus | Kecilkan nomor atau toggle "Nomor"; backend kini 12 warna (#23) |
| 2 | Favicon dari logo | |
| 3 | Transisi saat back bawaan browser / gestur HP | Sekarang animasi hanya lewat "← Galeri" atau `Esc` |
| 4 | Audit aksesibilitas | Target ≥44 px, kontras 4,5:1, keyboard |

## 4. Peta kode `web/`

| Area | File |
| --- | --- |
| Klien API, error, idempotensi | `lib/api.ts`, `lib/api-error.ts`, `lib/schemas.ts` (Zod, mirror Pydantic) |
| Sesi | `lib/session-store.ts` (`withSession`, `ensureSession`), `lib/session-token.ts` |
| Polling job | `lib/jobs.ts` (`useJob`, `jobPollInterval`) |
| Galeri | `components/gallery/room/*` (aula 3D: `plan.ts`, `room-scene.tsx`, `gallery-room.tsx`, `frame-texture.ts`), `gallery.tsx` (pilih 3D atau datar), `museum-gallery.tsx` + `room-3d.tsx` (cadangan tanpa WebGL), `framed-art.tsx`, `frames.ts`, `how-it-works.tsx`, `lib/artworks.ts`, `lib/gallery-entrance.ts` |
| Landing 3D | `components/landing/*` (R3F; config di `landing-config.ts`, state jalan di `travel-state.ts`, kamera `camera-rig.tsx`) |
| Detail, Persiapan, Latihan, Checkpoint, Unggah, Selesai | `components/artwork`, `preparation`, `practice`, `checkpoint`, `upload`, `finish` |
| Storyline | `components/story/*`, `lib/story.ts`, `app/cerita/[id]/page.tsx` |
| Mock dev | `lib/dev-mock.ts`, `lib/dev-mock-story.ts`, `scripts/build-dev-fixtures.mjs` |

Konvensi: halaman tipis di `app/`, view di `components/<fitur>/`, CSS Modules. Galeri/detail/cerita pakai `<img>` biasa (signed URL Supabase berubah tiap request), bukan `next/image`.

Stack: Next.js 15 App Router (Turbopack), TypeScript, CSS Modules + Tailwind v4, shadcn/ui, TanStack Query, Zustand, Zod, React Three Fiber/drei/postprocessing, Vitest.

## 5. Cara jalanin lokal

Tiga proses (di sesi Claude: jalankan di background, log ke scratchpad):

```bash
cd ~/Desktop/xav/Rerupa/api && uv run uvicorn main:app --reload
```

```bash
cd ~/Desktop/xav/Rerupa/api && uv run python worker.py
```

```bash
cd ~/Desktop/xav/Rerupa/web && npm run dev -- --port 3000
```

- Web http://localhost:3000, API http://localhost:8000 (`/docs`). `.claude/launch.json` punya konfigurasi `web` untuk browser pane.
- API lokal memakai Supabase dev (Tokyo), produksi Supabase Singapura.
- Mode mock tanpa backend: `NEXT_PUBLIC_API_MOCK=1` di `web/.env.local`, lalu `npm run fixtures`.
- Cek: `npm run check` (lint + typecheck + 57 tes). Build: `npm run build:check`.
