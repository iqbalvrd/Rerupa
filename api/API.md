# Rerupa API — Panduan untuk Frontend

Status per Fase 7 backend (versi showcase; URL produksi menyusul). Dokumentasi interaktif lengkap: jalankan API lalu buka `http://localhost:8000/docs` (OpenAPI dibuat otomatis dari kode). Contoh respons ada di [`examples/`](examples/).

## Cara memanggil

- Basis lokal: `http://localhost:8000`. Atur di frontend lewat `NEXT_PUBLIC_API_BASE_URL`.
- **Selalu kirim cookie:** `fetch(url, { credentials: "include" })`. Sesi tamu disimpan di cookie httpOnly `rerupa_session`; frontend tidak bisa (dan tidak perlu) membacanya.
- **Endpoint yang membuat job** wajib header `Idempotency-Key`: buat UUID baru per aksi pengguna (`crypto.randomUUID()`), dan pakai UUID yang sama bila mengulang aksi itu (retry/klik ganda) — job tidak akan dibuat dua kali.
- **Akun:** daftar/masuk/keluar lewat Supabase Auth (email + password) langsung dari frontend (`@supabase/supabase-js`). Setiap request dari pengguna yang masuk membawa `Authorization: Bearer <access_token>`; API memverifikasinya ke Supabase Auth dan membaca peran dari `profiles.role` (klaim peran dari klien tidak dipercaya). Tamu boleh melihat galeri, detail karya, dan tutorial koleksi; **membuat sesi latihan, unggah tutorial, checkpoint, dan cerita mode bebas wajib masuk** (`401 login_required`).
- **Error** selalu berbentuk `{ "error": { "code": "...", "message": "..." } }`. Tampilkan `message` ke pengguna; pakai `code` untuk logika UI.

## Endpoint

| Metode & path | Status | Butuh sesi | Keterangan |
| --- | --- | --- | --- |
| `GET /health` | ✅ | — | Status API, Supabase, OpenAI |
| `GET /artworks` | ✅ | — | Galeri karya terbit. [contoh](examples/artworks_list.json) |
| `GET /artworks/{slug}` | ✅ | — | Detail + sumber. [contoh](examples/artwork_detail.json) |
| `GET /auth/me` | ✅ | akun | `{id, email, role}`; `role` = `user` \| `admin` |
| `POST /auth/logout` | ✅ | — | 204; lupakan cookie sesi latihan di browser ini (token Supabase dicabut frontend) |
| `GET /admin/users`, `PATCH /admin/users/{id}` | ✅ | admin | Daftar akun; body `{role}`. Tidak bisa mengubah peran sendiri (409) |
| `GET /admin/ai-usage?days=7` | ✅ | admin | Ringkasan `ai_usage` (total, per hari/tugas/model), `days` 1–90 |
| `GET /admin/content` | ✅ | admin | Karya koleksi + versi tutorial + cerita koleksi beserta statusnya |
| `PATCH /admin/artworks/{id}`, `/admin/lessons/{id}`, `/admin/stories/{id}` | ✅ | admin | Body `{status: draft\|in_review\|published\|archived}` (cerita: `review_status`) |
| `POST /sessions` | ✅ | akun | Body `{canvas_size?, palette_id?, lesson_version_id?}` → 201 + Set-Cookie. [contoh](examples/session.json) |
| `GET /sessions/{id}` | ✅ | ✅ | Pulihkan sesi setelah reload; `lesson_version_id` terisi otomatis setelah tutorial jadi |
| `PATCH /sessions/{id}` | ✅ | ✅ | Body `{lesson_version_id?, palette_id?, canvas_size?, current_stage_order?}`. `lesson_version_id`: materi koleksi terbit (dari `GET /artworks`) atau tutorial mode bebas milik sesi ini |
| `DELETE /sessions/{id}` | ✅ | ✅ | 204; akses langsung dicabut, foto dan lapisan tutorial dihapus |
| `POST /lessons/generate` | ✅ | ✅ | multipart `file` + `consent_ai_photo` + `scope` (opsional) + header `Idempotency-Key` → 202 job |
| `GET /jobs/{id}` | ✅ | ✅ | Polling tiap 1 s selama 10 s pertama, lalu tiap 2 s, sampai `is_final: true` |
| `GET /lessons/{id}` | ✅ | hanya untuk mode bebas | Tutorial lengkap + saran warna. Query opsional `?palette_id=`. [contoh nyata](examples/lesson_detail.json) |
| `GET /palettes` | ✅ | — | Palet yang bisa dipilih di layar Persiapan + daftar cat. [contoh](examples/palettes.json) |
| `GET /recipes/{id}` | ✅ | — | Detail resep (teruji/perkiraan) bila `recipe_id` terisi |
| `GET /sessions/{id}/progress` | ✅ | ✅ | Status tiap tahap untuk memulihkan latihan. [contoh](examples/progress.json) |
| `PATCH /sessions/{id}/progress` | ✅ | ✅ | Body `{stage_code, status: "viewed" \| "completed"}` → sama seperti GET |
| `POST /sessions/{id}/checkpoints` | ✅ | ✅ | multipart `file` + `stage_code` + `corners` + `consent_ai_photo` + header `Idempotency-Key` → 202 job `feedback` |
| `GET /sessions/{id}/checkpoints` | ✅ | ✅ | Semua checkpoint sesi, terbaru dulu |
| `GET /sessions/{id}/checkpoints/{job_id}` | ✅ | ✅ | Hasil satu checkpoint. [contoh](examples/checkpoint_feedback.json), [foto ulang](examples/checkpoint_retake.json) |
| `POST /events` | ✅ | opsional | Body `{name, props?}` → 204. Event analitik dari UI |

## Alur unggah mode bebas

```
POST /sessions                      → cookie terpasang (sekali per pengguna)
POST /lessons/generate              → 202 { id, status: "queued" }
GET  /jobs/{id} (tiap 1 s selama 10 s pertama, lalu tiap 2 s) → progress.step: queued → started → cv → planning → colors → writing → saving → done
                                    → is_final: true → cek status:
   succeeded     → GET /lessons/{lesson_version_id}
   needs_retake  → tampilkan error_message (photo_unusable / not_artwork), minta foto ulang atau tawarkan galeri
   failed        → tampilkan error_message, tawarkan coba lagi / galeri
```

Teks untuk layar "Membuat tutorial" per `progress.step`: `cv` = "Menganalisis foto", `planning` = "Membagi tahapan", `colors` = "Menghitung campuran warna", `writing` = "Menulis instruksi", `saving` = "Menyimpan".

Perkiraan waktu (laptop, CPU): ±10–15 s sampai `succeeded` tanpa AI.

### Form `POST /lessons/generate`

| Field | Wajib | Isi |
| --- | --- | --- |
| `file` | ✅ | JPEG/PNG/WebP ≤10 MB |
| `consent_ai_photo` | ✅ | `true` bila pengguna setuju foto dikirim ke penyedia AI. `false` → tutorial tetap dibuat, teks memakai templat |
| `scope` | — | JSON string `{"x","y","w","h"}` pecahan 0–1 dari foto: area **satu figur** yang dilatih. Sangat dianjurkan untuk lukisan penuh tokoh |

## Membaca `GET /lessons/{id}`

- `image_width × image_height` = ruang koordinat **semua** lapisan, `bbox`, dan `focus_bbox`. Pakai satu `<svg viewBox="0 0 W H">`.
- `purged: true` + `url: null` pada lapisan mode bebas = file sudah dihapus otomatis (foto dan turunannya ≤24 jam, PRD §17). Tampilkan penanda "Foto sudah dihapus otomatis"; teks tahap, resep, dan feedback tetap ada. `grid` tidak pernah dihapus.
- `layers[]`: `kind` = `grid`, `sketch`, `main_object` (bila ada), `regions`, `value` (hanya bila `use_shading`), `lineart` (PNG transparan), `original_photo` (JPEG). `url` adalah signed URL **30 menit** (koleksi: 60 menit) — panggil ulang `GET /lessons/{id}` bila kedaluwarsa.
- `regions.svg` berisi satu `<path id="rNN">` per region. Tahap N menampilkan semua region dari `new_region_codes` tahap 1..N; region baru di tahap N diberi highlight.
- `stages[]` urut `order_no`; `layers` = lapisan yang tampil di tahap itu; `is_checkpoint` = tahap yang meminta foto progres (versi awal: hanya tahap sketsa).
- `focus_bbox` = area untuk tombol "Zoom ke area ini" pada foto asli.
- `generated_automatically: true` → tampilkan label "dibuat otomatis".
- `ai_text_status`: `ai`, `template`, atau `curated`.
- `culture_claims[]`: tampilkan label berbeda untuk `type: "fakta"` (dengan `sources`) dan `"perkiraan"`.
- `reflection` bisa `null` (hanya ada bila ada fakta bersumber).
- `region_colors[]` (satu per region) untuk `palette_id` yang dipakai: palet dari `?palette_id=`, lalu palet sesi (`PATCH /sessions` `palette_id`), lalu palet demo pertama. Isi: `label` ("Perkiraan, uji sedikit dulu" / "Sulit dicapai dengan palet ini" / "Resep teruji"), `components` (cat + `parts`, urut dari bagian terbesar), `mixed_hex` (pratinjau warna campuran), `delta_e`, `explanation` (kalimat siap tampil), `tips` (cara koreksi). Angka berasal dari model pencampuran pigmen, bukan AI.
- Bila foto dan cakupan yang sama dikirim lagi dalam sesi yang sama, backend memakai tutorial lama (`result.cached = true`) tanpa proses atau biaya ulang.

## Progres latihan

- Materi koleksi: ambil `lesson_version_id` dari kartu `GET /artworks`, lalu `POST /sessions` (atau `PATCH /sessions/{id}`) dengan `lesson_version_id`. Mode bebas: terpasang otomatis setelah tutorial jadi.
- Saat tahap dibuka: `PATCH …/progress {stage_code, status: "viewed"}`. Saat pengguna menekan "Selesai": `status: "completed"`. **Melihat tidak sama dengan menyelesaikan**: `viewed` tidak pernah menurunkan tahap yang sudah `completed`.
- Setelah reload: `GET /sessions/{id}` → `GET /lessons/{lesson_version_id}` → `GET …/progress` (status tiap tahap + `current_stage_order` + `feedback_count`) → `GET …/checkpoints` (teks feedback tetap ada walau foto sudah dihapus).
- Checkpoint boleh dilewati: tahap checkpoint bisa langsung `completed` tanpa foto; UI jangan menampilkannya seolah sudah mendapat feedback.

## Alur checkpoint (showcase: 2 checkpoint — tahap sketsa dan tahap bidang sedang)

```
Tahap dengan is_checkpoint: true → panduan memotret (seluruh bidang terlihat, cahaya rata, tanpa bayangan tangan)
→ ambil/unggah foto → pengguna TAP 4 SUDUT bidang grid (kiri-atas, kanan-atas, kanan-bawah, kiri-bawah; urutan bebas)
POST /sessions/{id}/checkpoints     → 202 { id, type: "feedback", status: "queued" }
GET  /jobs/{id} (1 s × 10, lalu 2 s)  → progress.step: queued → cv → writing → saving → done
   succeeded    → GET /sessions/{id}/checkpoints/{job_id} → tampilkan summary + suggestions
   needs_retake → tampilkan retake_message, minta foto/tap ulang (error_code: photo_unusable | alignment_failed | sketch_not_visible | progress_not_visible)
```

Perkiraan waktu: ±6–8 s (laptop, CPU, tanpa AI).

### Form `POST /sessions/{id}/checkpoints`

| Field | Wajib | Isi |
| --- | --- | --- |
| `file` | ✅ | JPEG/PNG/WebP ≤10 MB |
| `stage_code` | ✅ | Kode tahap dengan `is_checkpoint: true` (mis. `stage_2`). Tahap lain → 422 `not_checkpoint` |
| `corners` | ✅ | JSON string 8 angka `[x1,y1,x2,y2,x3,y3,x4,y4]`: 4 sudut **area grid** (bidang yang sama dengan gambar panduan) dalam **piksel foto seperti tampil di layar** (orientasi sudah benar, ukuran asli `naturalWidth × naturalHeight`, bukan ukuran CSS). Urutan bebas |
| `consent_ai_photo` | — | `true` bila pengguna setuju foto progres dikirim ke AI. Bawaan `false` → saran ditulis templat |

Kuota: per tahap checkpoint maks **2 feedback** (1 + 1 retry); foto ulang (`needs_retake`) tidak dihitung, total percobaan per tahap maks 6 → 429 `checkpoint_quota_exceeded`.

### Membaca hasil checkpoint

- `summary`: 1 kalimat pembuka. `suggestions`: **0–2** saran `{region_code, observation, action, bbox}`. Tanpa saran = sketsa sudah sesuai.
- `region_code` = kode region (`rNN`, sorot `<path id="rNN">` di `regions.svg`), `"main"` = siluet objek utama (sorot lapisan `main_object`), atau `"sketch"` = **seluruh sketsa bergeser** (sorot seluruh lapisan `sketch`; `bbox` = area semua garis). Saran `sketch` selalu di urutan pertama.
- `bbox` `[x, y, w, h]` di ruang `image_width × image_height` lesson — dipakai untuk penanda di atas foto/panduan. Hanya ada bila penyelarasan berhasil.
- `photo_url`: foto yang sudah diluruskan (rasio sama dengan lesson). Tampilkan di `<image width=W height=H>` pada `viewBox` lesson, lalu tumpuk lapisan `sketch`/`grid` untuk membandingkan. Signed URL 30 menit; `null` setelah foto dihapus (teks tetap ada).
- `text_source`: `ai` atau `template`; `generated_automatically: true` → label "dibuat otomatis".
- Checkpoint tahap sketsa menilai garis (posisi, ukuran, garis yang belum digambar). Checkpoint tahap warna menilai bidang yang belum terisi dan terang-gelap relatif terhadap panduan; di tahap ini grid boleh sudah tertutup cat (penyelarasan memakai tepi bidang warna). `corners` tetap 4 sudut area gambar.
- Cakupan penilaian versi awal: posisi relatif, ukuran bentuk besar, area yang belum tergambar/terisi. **Bukan** rona halus atau teknik sapuan — jangan ditampilkan seolah menilai itu.

### Event analitik (`POST /events`)

Nama yang diterima dari UI: `lesson_viewed`, `recipe_opened`, `original_photo_opened`, `feedback_shown`, `reflection_answered` (P1: `story_opened`, `recognition_confirmed`). `props` hanya `stage_order`, `origin`, `lesson_version_id`, `correct` (lainnya dibuang). Event `practice_started`, `stage_completed`, `checkpoint_requested`, `lesson_completed`, `session_deleted` dicatat backend sendiri. Tidak menyimpan gambar, jawaban bebas, atau ID sesi mentah.

## Storyline cerita (P1, aktif bila `FEATURE_STORY=true`)

Kisah di balik karya dalam 4–6 panel. Berlaku untuk **materi koleksi** dan **foto unggahan**. Setiap storyline membawa label sumber kisah, dan label itu **wajib ditampilkan**.

| Metode & path | Butuh sesi | Keterangan |
| --- | --- | --- |
| `POST /lessons/{id}/story` | mode bebas: ✅ | Body opsional `{title_hint, artist_hint, origin_hint, confirm_artwork_id, interpretation_only, consent_ai_photo}` + header `Idempotency-Key`. Respons `{story_id}` (200, sudah ada) atau `{job}` (202, sedang dibuat) |
| `GET /stories/{id}` | cerita mode bebas: ✅ | Cerita + panel. Polling sampai `status` bukan `generating`; panel muncul satu per satu |

### Alur di UI

```
Materi koleksi → POST /lessons/{id}/story → 200 {story_id} (atau 404 story_not_available)
Foto unggahan:
  1. Setelah tutorial jadi, cek GET /jobs/{generate}.result.recognition (bila FEATURE_RECOGNITION aktif)
     ada → tanya "Apakah ini <title> karya <artist>?"
       ya    → POST …/story {confirm_artwork_id} → 200 {story_id} (cerita koleksi yang sudah ditinjau)
  2. Selain itu isian "Tahu judul / seniman / asal karyanya?" opsional (boleh dilewati):
       diisi → POST …/story {title_hint, artist_hint, origin_hint, consent_ai_photo} → 202 {job}
       kosong → POST …/story {consent_ai_photo: true} → 202 {job}
     Agen riset di worker: kenali karya dari foto → cari sumber web tepercaya → skor keyakinan.
     TIDAK ada pertanyaan "Apakah ini …?"; keyakinan rendah → kisah jadi interpretasi tanpa nama karya.
  3. Polling GET /jobs/{job.id}; result.kind = story → GET /stories/{result.story_id}
```

### Membaca `GET /stories/{id}`

- `basis_label` (tampilkan di atas cerita): **"Kisah bersumber"** (`curated`/`sourced`), **"Berdasarkan info dari kamu"** (`user_hint`), atau **"Interpretasi AI"** (`ai_interpretation`). `basis_note` berisi satu kalimat penjelasan; untuk hasil agen riset menyebut kandidat karya dan tingkat keyakinannya.
- `identity`: `title`, `artist`, `origin`, `source` (`user` | `ai_research`), `confidence` (`high` | `medium` | `low`), `reason`. Tampilkan keyakinan sebagai badge bila `source = ai_research`.
- `claims[]`: `type` `fakta` (punya `source_urls`; tampilkan tautan) atau `perkiraan`. `sources[]` adalah daftar tautan sumber.
- `panels[]`: `narration` (≤40 kata), `image_url` (signed URL), `image_label`: **"Ilustrasi AI"** (wajib tampil di panel gambar AI) atau **"Potongan karya asli"**. `kind: "text"` / `status: "text_only"` → tampilkan kartu teks (gambar gagal atau ditolak pemeriksa).
- `character_codes` + `characters[].region_codes`: ketuk tokoh → lompat ke tahap yang membuka region itu (`new_region_codes` di `GET /lessons/{id}`).
- Panel cerita mode bebas dihapus setelah 24 jam (`purged: true`, `image_url: null`); narasi tetap ada.

## Kode error yang perlu ditangani di UI

| HTTP | `code` | Saran UI |
| --- | --- | --- |
| 401 | `session_required` | Buat sesi baru (`POST /sessions`) lalu ulangi |
| 401 | `login_required` | Arahkan ke `/masuk?next=<halaman ini>` |
| 403 | `admin_required` | Halaman/aksi khusus admin |
| 409 | `cannot_change_own_role`, `license_unknown` | Admin: ubah peran akun lain saja; lengkapi lisensi sebelum menerbitkan |
| 404 | `not_found` | Data tidak ada / bukan milik sesi ini |
| 400 | `idempotency_key_required` | Bug frontend: lupa header |
| 409 | `idempotency_conflict` | Bug frontend: kunci dipakai ulang untuk file lain |
| 413 | `file_too_large`, `image_too_large` | Minta foto lebih kecil |
| 422 | `file_invalid`, `validation_error` | Minta JPG/PNG/WebP; `fields` berisi nama field yang salah (termasuk `scope` yang keluar dari foto) |
| 429 | `quota_exceeded` | Batas 3 tutorial per sesi; arahkan ke galeri |
| 429 | `checkpoint_quota_exceeded` | Batas feedback tahap ini; ajak lanjut ke tahap berikutnya |
| 404 | `feature_disabled` | Fitur cerita/pencocokan belum aktif di server; sembunyikan tombolnya |
| 404 | `story_not_available` | Cerita materi ini belum ditinjau/terbit |
| 429 | `story_quota_exceeded` | Batas pembuatan cerita untuk tutorial ini tercapai |
| 409 | `lesson_required` | Sesi belum punya materi: pilih dari galeri atau buat tutorial |
| 422 | `not_checkpoint` | Bug frontend: tahap ini tidak meminta foto |
| 429 | `rate_limited` | Terlalu banyak permintaan; tunggu `Retry-After` detik (header) lalu coba lagi. Polling `/jobs` tiap 1 detik aman |
| 403 | `origin_not_allowed` | Domain frontend belum didaftarkan di `FRONTEND_ORIGIN` backend |
| 500 | `internal_error` | Tampilkan pesan umum, boleh coba lagi |

Di status job (`error_code`): `photo_unusable`, `not_artwork`, `alignment_failed`, `sketch_not_visible`, `progress_not_visible` (needs_retake), `session_deleted`, `worker_timeout` (melewati batas tunggu: tutorial 60 s, feedback 45 s; tidak memakan kuota — tawarkan coba lagi), `internal_error` (failed). Daftar lengkap pesan ada di `core/errors.py`.

## Cookie di produksi

Frontend (Vercel) dan API (Railway) beda domain, jadi cookie harus `SameSite=None; Secure`. Di backend produksi set `COOKIE_SAMESITE=none` dan `COOKIE_SECURE=true`, serta `FRONTEND_ORIGIN` = domain Vercel (preview Vercel lewat `FRONTEND_ORIGIN_REGEX`). Lokal tidak perlu diubah. Langkah deploy: [DEPLOY.md](DEPLOY.md).

Catatan iOS Safari: cookie pihak ketiga bisa diblokir (ITP) bila domain frontend dan API berbeda. Bila sesi hilang di iPhone saat uji, solusinya domain API sebagai subdomain frontend (mis. `api.<domain>`), bukan `*.up.railway.app`.
