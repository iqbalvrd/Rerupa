# Storyline cerita: handoff frontend (P1)

Per 22 Nov 2026, diperbarui 26 Nov 2026. Untuk sesi yang mengerjakan UI storyline di `web/`. Baca ini dulu, lalu `api/API.md` bagian **"Storyline cerita"** di `origin/main` (kontrak resminya).

## Apa ini

"Kisah di balik karya": 4–6 panel bergambar dengan narasi pendek, untuk **materi koleksi** dan **foto unggahan**. Backend sudah jadi (Iqbal, PR #19–#25, `api/routes/stories.py`, `api/story/`). Yang belum ada hanya UI-nya. Target di `RENCANA_PENGERJAAN.md` baris 8: cerita materi demo + 1 foto unggahan karya terkenal tampil dengan **label sumber yang benar** dan **fallback teks**.

Aturan yang tidak boleh dilanggar (PRD, `CLAUDERerupa.md`):

- Klaim budaya **tidak pernah** tampil sebagai fakta tanpa sumber. `fakta` selalu dengan tautan, `perkiraan` diberi label "Perkiraan".
- `basis_label` **wajib** tampil di atas cerita, dan `image_label` **wajib** tampil di setiap panel bergambar ("Ilustrasi AI" / "Potongan karya asli").
- Foto unggahan hanya dikirim ke AI bila pengguna setuju (`consent_ai_photo`).
- Teks UI Bahasa Indonesia, hangat, pendek.

## Status backend (26 Nov 2026)

- **Alur yang dipakai: B (agen riset)**, sudah di `main`. Tidak ada pertanyaan "Apakah ini …?". Isian judul/seniman/asal opsional (boleh dilewati) → `POST …/story` → 202 job. Worker: kenali dari foto → cari sumber web → skor keyakinan. Hasil job hanya `kind: "story"`. `identity` dapat `source` (`user` / `ai_research`), `confidence` (`high` / `medium` / `low`), `reason`; tampilkan keyakinan sebagai badge bila `source = ai_research`.
- **Produksi: `FEATURE_STORY=true` dan `FEATURE_RECOGNITION=true` sudah aktif** (API + worker di Railway). Endpoint cerita tidak lagi mengembalikan `feature_disabled`.
- **Materi koleksi belum punya cerita terbit** untuk versi lesson yang sekarang (v3, impor ulang 25 Nov). Sampai Iqbal menjalankan `scripts/generate_story.py <slug>` lalu `--publish`, materi koleksi menjawab 404 `story_not_available`: UI harus menyembunyikan tombol cerita dengan rapi.
- Alur A (`confirm_artwork_id`, `result.recognition`) masih diterima backend demi kompatibilitas, tetapi **UI tidak perlu membuatnya**.
- Biaya: ±$0,26–0,30 per cerita foto unggahan (±85% dari gambar panel). Batas harian AI `DAILY_AI_BUDGET_USD=5`.

## Kontrak singkat

**`POST /lessons/{lesson_version_id}/story`**: header `Idempotency-Key` (pakai `newIdempotencyKey()` dari `lib/api.ts`), body opsional:

```json
{ "title_hint": "", "artist_hint": "", "origin_hint": "", "confirm_artwork_id": null, "interpretation_only": false, "consent_ai_photo": false }
```

- 200 `{ "story_id": "…" }`: cerita sudah ada, langsung `GET /stories/{id}`.
- 202 `{ "job": { …JobOut } }`: polling `GET /jobs/{job.id}` sampai `is_final`, lalu `result.story_id`.
- Materi koleksi selalu 200 (cerita kurasi yang sudah ditinjau) atau 404 `story_not_available`.
- Batas: maks 4 job cerita per tutorial, 1 cerita jadi.

**`GET /stories/{id}`**: polling sampai `status` bukan `generating`; panel muncul satu per satu (`status: pending` → `ready` / `text_only`).

```
StoryOut {
  id, lesson_version_id,
  status: generating | ready | text_only | failed,
  story_basis: curated | sourced | user_hint | ai_interpretation,
  basis_label, basis_note,            // tampilkan apa adanya dari server
  title, summary,
  identity: { title, artist, origin, (B: source, confidence, reason) },
  claims:  [{ text, type: fakta | perkiraan, source_urls[] }],
  sources: [{ url, title, domain }],
  characters: [{ code, name, description, region_codes[] }],
  panels: [{ order_no, narration, kind: generated | artwork_crop | text,
             status: pending | ready | text_only, image_url, image_label,
             purged, character_codes[], focus_region_codes[] }]
}
```

- `kind: "text"` atau `status: "text_only"` → kartu teks saja (gambar gagal atau ditolak pemeriksa).
- `purged: true` (cerita mode bebas lebih dari 24 jam) → `image_url: null`, narasi tetap ada.
- Ketuk tokoh → cari tahap di `GET /lessons/{id}` yang `new_region_codes`-nya memuat salah satu `region_codes` tokoh → lompat ke tahap itu di ruang latihan.

**Error** (`lib/api-error.ts` sudah memetakan `code`): `feature_disabled` 404 → sembunyikan tombol cerita; `story_not_available` 404 → sembunyikan atau tampilkan "Kisah karya ini belum tersedia"; `story_quota_exceeded` 429.

**Event** (`api.trackEvent`, `lib/api.ts`; tambahkan nama baru ke tipe `EventName`): `story_opened`. (`recognition_confirmed` hanya untuk alur A, tidak dipakai.) Props yang diterima hanya `stage_order`, `origin`, `lesson_version_id`, `correct`.

## Peta kode `web/` yang relevan

| File | Pakai untuk |
| --- | --- |
| `lib/api.ts` | Tambah `startStory(lessonId, body, idempotencyKey)` dan `getStory(id)` di objek `api`. Pola `request(path, ZodSchema, opts)` |
| `lib/schemas.ts` | Tambah `StoryStart`, `Story`, `StoryPanel`, dan seterusnya (Zod, mirror Pydantic). `Job.result` masih `record<string, unknown>`; parse `result` cerita dengan schema sendiri |
| `lib/jobs.ts` | `useJob(jobId)` untuk polling. **Catatan:** API.md sekarang minta 1 s selama 10 s lalu 2 s. `JOB_POLL_INTERVAL_MS` masih 1 s tetap; mungkin sudah diperbaiki di sesi lain |
| `lib/session-store.ts` | `withSession()` / `ensureSession()`: cerita mode bebas butuh sesi |
| `lib/artworks.ts` | `artworkQuery(slug)`; detail punya `lesson_version_id` untuk materi koleksi |
| `lib/stages.ts` | Helper tahap (`regionsUpTo`, `regionsByCode`); tambah helper "tahap pertama yang membuka region X" untuk lompat dari tokoh |
| `lib/dev-mock.ts` + `scripts/build-dev-fixtures.mjs` | Mock API dev (`NEXT_PUBLIC_API_MOCK=1`). Tambah jawaban untuk `POST …/story` dan `GET /stories/{id}` (panel `pending` → `ready` bertahap, satu `text_only`, satu `artwork_crop`) |
| `components/artwork/artwork-detail.tsx` | Halaman detail karya. Sudah ada `StoryCard` (klaim budaya statis). Titik masuk "Kisah di balik karya" untuk materi koleksi |
| `components/finish/finish-view.tsx` | Halaman Selesai. Titik masuk kedua (koleksi + mode bebas) |
| `components/upload/upload-view.tsx` | Unggah mode bebas; setelah tutorial jadi → `router.push("/persiapan")`. Di sini atau di Persiapan/Selesai tempat isian judul/seniman/asal dan izin foto |
| `components/practice/practice-view.tsx` | Ruang latihan; target lompatan dari tokoh |

Rute baru yang disarankan: `app/cerita/[id]/page.tsx` (tampilan cerita), atau dialog/sheet dari detail karya dan Selesai. Ikuti pola halaman yang ada: komponen view di `components/<fitur>/`, halaman tipis di `app/`.

## Konvensi proyek

- Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui (Radix), TanStack Query, Zustand, Zod, Vitest.
- Pakai skill **modern-web-guidance** sebelum kerja HTML/CSS/JS; pesan akhir ditutup dengan bagian `### Modern Web Guidance`.
- `npm run check` = lint + typecheck + test. **Jangan** `npm run build` saat dev server jalan (menimpa `.next`); pakai `npm run build:check`.
- Jangan pernah cetak atau commit isi `api/.env` atau `web/.env.local`.
- Galeri dan detail karya pakai `<img>` biasa (bukan `next/image`) karena signed URL Supabase berubah tiap request. Panel cerita sama.
- Commit di branch sendiri; jangan push atau buka PR tanpa izin Xavier.

## Cara jalanin

```bash
cd ~/Desktop/xav/Rerupa/api && uv run uvicorn main:app --reload
```

```bash
cd ~/Desktop/xav/Rerupa/api && uv run python worker.py
```

```bash
cd ~/Desktop/xav/Rerupa/web && npm run dev
```

Fitur cerita butuh `FEATURE_STORY=true` dan `FEATURE_RECOGNITION=true` di `api/.env` (produksi sudah aktif sejak 26 Nov); minta Iqbal kalau belum ada di lokal. Tanpa backend: `NEXT_PUBLIC_API_MOCK=1` di `web/.env.local`, lalu `npm run fixtures`.

## Selesai berarti

- Materi koleksi: tombol cerita di detail karya (dan Selesai) → cerita tampil dengan `basis_label`, klaim + sumber, panel berlabel.
- Foto unggahan: alur B jalan dari isian/izin sampai cerita tampil, termasuk kasus `text_only` dan `purged`.
- Tombol tersembunyi rapi saat `feature_disabled` / `story_not_available`.
- Ketuk tokoh membuka tahap yang tepat.
- Mock dev mencakup semua kasus di atas; `npm run check` lulus; dicek di browser (mock, dan API asli bila fitur aktif).
