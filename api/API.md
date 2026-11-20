# Rerupa API — Panduan untuk Frontend

Status per Fase 1 backend. Dokumentasi interaktif lengkap: jalankan API lalu buka `http://localhost:8000/docs` (OpenAPI dibuat otomatis dari kode). Contoh respons ada di [`examples/`](examples/).

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
| `GET /sessions/{id}` | ✅ | ✅ | Pulihkan sesi setelah reload |
| `PATCH /sessions/{id}` | ✅ | ✅ | Body `{palette_id?, canvas_size?, current_stage_order?}` |
| `DELETE /sessions/{id}` | ✅ | ✅ | 204; akses langsung dicabut |
| `POST /lessons/generate` | ✅ (job) | ✅ | multipart `file` + `consent_ai_photo` + header `Idempotency-Key` → 202 job |
| `GET /jobs/{id}` | ✅ | ✅ | Polling tiap 1 detik sampai `is_final: true` |
| `GET /lessons/{id}` | ⏳ Fase 3 | sesi untuk mode bebas | Bentuk draf: [lesson_detail.draft.json](examples/lesson_detail.draft.json) |
| `GET /recipes/{id}` | ⏳ Fase 4 | — | |
| `PATCH /sessions/{id}/progress` | ⏳ Fase 5 | ✅ | |
| `POST /sessions/{id}/checkpoints` | ⏳ Fase 5 | ✅ | |

Catatan Fase 1: `POST /lessons/generate` sudah menerima dan menyimpan foto, tetapi job berakhir `failed` dengan `error_code: "pipeline_not_ready"` sampai pipeline CV + AI jadi (Fase 2–4). Pakai ini untuk membangun layar unggah dan status job.

## Alur unggah mode bebas

```
POST /sessions                      → cookie terpasang (sekali per pengguna)
POST /lessons/generate              → 202 { id, status: "queued" }
GET  /jobs/{id} (tiap 1 detik)      → progress.step: queued → started → … → done
                                    → is_final: true → cek status:
   succeeded → GET /lessons/{lesson_version_id}
   needs_retake / failed → tampilkan error_message, tawarkan coba lagi / galeri
```

## Kode error yang perlu ditangani di UI

| HTTP | `code` | Saran UI |
| --- | --- | --- |
| 401 | `session_required` | Buat sesi baru (`POST /sessions`) lalu ulangi |
| 404 | `not_found` | Data tidak ada / bukan milik sesi ini |
| 400 | `idempotency_key_required` | Bug frontend: lupa header |
| 409 | `idempotency_conflict` | Bug frontend: kunci dipakai ulang untuk file lain |
| 413 | `file_too_large`, `image_too_large` | Minta foto lebih kecil |
| 422 | `file_invalid`, `validation_error` | Minta JPG/PNG/WebP; `fields` berisi nama field yang salah |
| 429 | `quota_exceeded` | Batas 3 tutorial per sesi; arahkan ke galeri |
| 500 | `internal_error` | Tampilkan pesan umum, boleh coba lagi |

Daftar lengkap pesan ada di `core/errors.py`.

## Cookie di produksi

Frontend (Vercel) dan API (Railway) beda domain, jadi cookie harus `SameSite=None; Secure`. Di backend produksi set `COOKIE_SAMESITE=none` dan `COOKIE_SECURE=true`, serta `FRONTEND_ORIGIN` = domain Vercel. Lokal tidak perlu diubah.
