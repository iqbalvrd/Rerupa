# Rerupa API — Panduan untuk Frontend

Status per Fase 3 backend. Dokumentasi interaktif lengkap: jalankan API lalu buka `http://localhost:8000/docs` (OpenAPI dibuat otomatis dari kode). Contoh respons ada di [`examples/`](examples/).

## Cara memanggil

- Basis lokal: `http://localhost:8000`. Atur di frontend lewat `NEXT_PUBLIC_API_BASE_URL`.
- **Selalu kirim cookie:** `fetch(url, { credentials: "include" })`. Sesi tamu disimpan di cookie httpOnly `rerupa_session`; frontend tidak bisa (dan tidak perlu) membacanya.
- **Endpoint yang membuat job** wajib header `Idempotency-Key`: buat UUID baru per aksi pengguna (`crypto.randomUUID()`), dan pakai UUID yang sama bila mengulang aksi itu (retry/klik ganda) — job tidak akan dibuat dua kali.
- **Error** selalu berbentuk `{ "error": { "code": "...", "message": "..." } }`. Tampilkan `message` ke pengguna; pakai `code` untuk logika UI.

## Endpoint

| Metode & path | Status | Butuh sesi | Keterangan |
| --- | --- | --- | --- |
| `GET /health` | ✅ | — | Status API, Supabase, OpenAI |
| `GET /artworks` | ✅ | — | Galeri karya terbit. [contoh](examples/artworks_list.json) |
| `GET /artworks/{slug}` | ✅ | — | Detail + sumber. [contoh](examples/artwork_detail.json) |
| `POST /sessions` | ✅ | — | Body `{canvas_size?, palette_id?}` → 201 + Set-Cookie. [contoh](examples/session.json) |
| `GET /sessions/{id}` | ✅ | ✅ | Pulihkan sesi setelah reload; `lesson_version_id` terisi otomatis setelah tutorial jadi |
| `PATCH /sessions/{id}` | ✅ | ✅ | Body `{palette_id?, canvas_size?, current_stage_order?}` |
| `DELETE /sessions/{id}` | ✅ | ✅ | 204; akses langsung dicabut, foto dan lapisan tutorial dihapus |
| `POST /lessons/generate` | ✅ | ✅ | multipart `file` + `consent_ai_photo` + `scope` (opsional) + header `Idempotency-Key` → 202 job |
| `GET /jobs/{id}` | ✅ | ✅ | Polling tiap 1 detik sampai `is_final: true` |
| `GET /lessons/{id}` | ✅ | hanya untuk mode bebas | Tutorial lengkap. [contoh nyata](examples/lesson_detail.json) |
| `GET /recipes/{id}` | ⏳ Fase 4 | — | `region_colors` di lesson masih `[]` |
| `PATCH /sessions/{id}/progress` | ⏳ Fase 5 | ✅ | |
| `POST /sessions/{id}/checkpoints` | ⏳ Fase 5 | ✅ | |

## Alur unggah mode bebas

```
POST /sessions                      → cookie terpasang (sekali per pengguna)
POST /lessons/generate              → 202 { id, status: "queued" }
GET  /jobs/{id} (tiap 1 detik)      → progress.step: queued → started → cv → planning → writing → saving → done
                                    → is_final: true → cek status:
   succeeded     → GET /lessons/{lesson_version_id}
   needs_retake  → tampilkan error_message (photo_unusable / not_artwork), minta foto ulang atau tawarkan galeri
   failed        → tampilkan error_message, tawarkan coba lagi / galeri
```

Teks untuk layar "Membuat tutorial" per `progress.step`: `cv` = "Menganalisis foto", `planning` = "Membagi tahapan", `writing` = "Menulis instruksi", `saving` = "Menyimpan".

Perkiraan waktu (laptop, CPU): ±10–15 s sampai `succeeded` tanpa AI.

### Form `POST /lessons/generate`

| Field | Wajib | Isi |
| --- | --- | --- |
| `file` | ✅ | JPEG/PNG/WebP ≤10 MB |
| `consent_ai_photo` | ✅ | `true` bila pengguna setuju foto dikirim ke penyedia AI. `false` → tutorial tetap dibuat, teks memakai templat |
| `scope` | — | JSON string `{"x","y","w","h"}` pecahan 0–1 dari foto: area **satu figur** yang dilatih. Sangat dianjurkan untuk lukisan penuh tokoh |

## Membaca `GET /lessons/{id}`

- `image_width × image_height` = ruang koordinat **semua** lapisan, `bbox`, dan `focus_bbox`. Pakai satu `<svg viewBox="0 0 W H">`.
- `layers[]`: `kind` = `grid`, `sketch`, `main_object` (bila ada), `regions`, `value` (hanya bila `use_shading`), `lineart` (PNG transparan), `original_photo` (JPEG). `url` adalah signed URL **30 menit** (koleksi: 60 menit) — panggil ulang `GET /lessons/{id}` bila kedaluwarsa.
- `regions.svg` berisi satu `<path id="rNN">` per region. Tahap N menampilkan semua region dari `new_region_codes` tahap 1..N; region baru di tahap N diberi highlight.
- `stages[]` urut `order_no`; `layers` = lapisan yang tampil di tahap itu; `is_checkpoint` = tahap yang meminta foto progres (versi awal: hanya tahap sketsa).
- `focus_bbox` = area untuk tombol "Zoom ke area ini" pada foto asli.
- `generated_automatically: true` → tampilkan label "dibuat otomatis".
- `ai_text_status`: `ai`, `template`, atau `curated`.
- `culture_claims[]`: tampilkan label berbeda untuk `type: "fakta"` (dengan `sources`) dan `"perkiraan"`.
- `reflection` bisa `null` (hanya ada bila ada fakta bersumber).

## Kode error yang perlu ditangani di UI

| HTTP | `code` | Saran UI |
| --- | --- | --- |
| 401 | `session_required` | Buat sesi baru (`POST /sessions`) lalu ulangi |
| 404 | `not_found` | Data tidak ada / bukan milik sesi ini |
| 400 | `idempotency_key_required` | Bug frontend: lupa header |
| 409 | `idempotency_conflict` | Bug frontend: kunci dipakai ulang untuk file lain |
| 413 | `file_too_large`, `image_too_large` | Minta foto lebih kecil |
| 422 | `file_invalid`, `validation_error` | Minta JPG/PNG/WebP; `fields` berisi nama field yang salah (termasuk `scope` yang keluar dari foto) |
| 429 | `quota_exceeded` | Batas 3 tutorial per sesi; arahkan ke galeri |
| 500 | `internal_error` | Tampilkan pesan umum, boleh coba lagi |

Di status job (`error_code`): `photo_unusable`, `not_artwork` (needs_retake), `session_deleted`, `worker_timeout`, `internal_error` (failed). Daftar lengkap pesan ada di `core/errors.py`.

## Cookie di produksi

Frontend (Vercel) dan API (Railway) beda domain, jadi cookie harus `SameSite=None; Secure`. Di backend produksi set `COOKIE_SAMESITE=none` dan `COOKIE_SECURE=true`, serta `FRONTEND_ORIGIN` = domain Vercel. Lokal tidak perlu diubah.
