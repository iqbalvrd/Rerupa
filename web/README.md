# Rerupa web

Frontend Rerupa: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui (Radix).
Kontrak API: [`../api/API.md`](../api/API.md). Aturan proyek: `CLAUDE.md` di root.

## Menjalankan lokal

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL, bawaan http://localhost:8000
npm install
npm run dev                  # http://localhost:3000
```

API harus jalan di terminal lain (lihat `HANDOFF.md §7`).

### Galeri tanpa API (data contoh)

Selama belum ada karya terbit, galeri bisa memakai data contoh dari `../content/artworks`:

```bash
npm run fixtures                                   # tulis public/_dev/ (tidak masuk git)
echo "NEXT_PUBLIC_GALLERY_SOURCE=fixtures" >> .env.local
```

Galeri lalu menampilkan label "Data contoh (dev), belum terbit". Hapus baris itu untuk kembali memakai `GET /artworks`.

## Perintah

| Perintah | Isi |
| --- | --- |
| `npm run dev` | Server dev |
| `npm run build` | Build produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript tanpa emit |
| `npm run test` | Vitest (skema, klien API, sesi) |
| `npm run check` | lint + typecheck + test |

## Struktur

```
app/                 # route (App Router); layout.tsx memasang font, viewport, Providers
components/
  app-shell.tsx      # bingkai halaman mobile-first (header, kolom baca, safe area)
  ui/                # shadcn
  dev/               # alat bantu khusus mode dev
lib/
  api.ts             # klien API: cookie sesi, Idempotency-Key, ApiError {code, message}
  schemas.ts         # Zod, disalin dari model Pydantic di api/routes
  session-store.ts   # id sesi tamu (Zustand + localStorage), ensureSession/withSession/endSession
  jobs.ts            # useJob: polling GET /jobs/{id} tiap 1 detik sampai is_final
```

## Aturan penting

- **Satu skema, dua sisi.** Ubah model Pydantic di `api/routes` → ubah `lib/schemas.ts` di commit yang sama. `lib/schemas.test.ts` memvalidasi semua file di `api/examples/`.
- **Sesi:** token ada di cookie httpOnly; web hanya menyimpan *id* sesi untuk URL. Buat sesi saat dibutuhkan (`ensureSession()` sebelum mulai latihan atau unggah), bukan saat halaman dibuka.
- **Job:** buat `newIdempotencyKey()` sekali per aksi pengguna dan pakai ulang saat retry.
- **Error:** tampilkan `err.message` dari `ApiError`; logika UI memakai `err.code`.
- **UI:** bahasa Indonesia, kalimat pendek, tanpa em dash. Target sentuh memakai `--target-size` (44 px di layar sentuh). Ukuran huruf root jangan diubah (agar skala teks OS bekerja).
