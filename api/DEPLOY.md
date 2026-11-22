# Deploy backend Rerupa (Railway)

Dua service, **dua image**: `api` dari `Dockerfile.api` (ringan, tanpa torch) dan `worker` dari `Dockerfile.worker` (torch CPU + model tertanam). Region **Singapura** (`asia-southeast1`), sama dengan project Supabase (`ap-southeast-1`), supaya pengguna, API, worker, dan database berdekatan.

> Belum pernah di-build di mesin pengembang (Docker tidak terpasang); build pertama di Railway adalah ujinya. Perkiraan ukuran: API ±250 MB, worker ±2–2,5 GB. Lapisan model worker dibangun sebelum kode disalin, jadi perubahan kode tidak mengunduh ulang model.

## 1. Sekali saja

1. Railway → **New Project → Deploy from GitHub repo** → `iqbalvrd/Rerupa`.
2. Service pertama (**api**): Settings → **Root Directory** = `api`. Builder Dockerfile, path `Dockerfile.api`, healthcheck `/health` (diatur di Settings, tanpa config-as-code). Region Singapura. Settings → Networking → **Generate Domain**. Ukuran: 0,5 vCPU / 512 MB, **1 instance** (rate limit di memori).
3. Service kedua (**worker**): New → GitHub repo yang sama, Root Directory `api`, Dockerfile path `Dockerfile.worker`, restart ALWAYS, draining 60 s (diatur di Settings), tanpa domain publik. Ukuran: 2 vCPU / 3 GB (2 jalur pemroses). Bila build gagal karena Hugging Face membatasi unduhan, tambahkan variabel build `HF_TOKEN` (token baca gratis).
4. Isi variabel (Shared Variables untuk keduanya, tabel di bawah).
5. Deploy. Cek `https://<domain-api>/health` → `status: ok`, `supabase: ok`, `environment: production`.
6. Kirim domain API ke Xavier → Vercel `NEXT_PUBLIC_API_BASE_URL`.
7. Smoke test dari laptop (alur lengkap seperti pengguna, data uji dihapus sendiri):
   ```bash
   cd api && uv run --group cv python scripts/smoke.py --base-url https://<domain-api>
   ```

## 2. Variabel lingkungan

| Variabel | api | worker | Nilai produksi |
| --- | --- | --- | --- |
| `ENVIRONMENT` | ✅ | ✅ | `production` (API menolak start bila konfigurasi berbahaya) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | **Rahasia**. Disarankan rotasi key yang pernah ditempel di chat sebelum produksi |
| `FRONTEND_ORIGIN` | ✅ | | `https://<domain-vercel>` (beberapa dipisah koma) |
| `FRONTEND_ORIGIN_REGEX` | ✅ | | Opsional, preview Vercel, mis. `^https://rerupa-[a-z0-9-]+-xavier\.vercel\.app$` |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | ✅ | | `none` / `true` (frontend & API beda domain) |
| `TRUST_PROXY_HEADERS` | ✅ | | `true` (IP klien dari proxy Railway untuk rate limit) |
| `EXPOSE_DOCS` | ✅ | | `false` |
| `OPENAI_API_KEY` | ✅ | ✅ | **Rahasia**. Pakai key baru (yang pernah ditempel di chat harus dicabut) |
| `OPENAI_VISION_MODEL`, `OPENAI_TEXT_MODEL` | ✅ | ✅ | `gpt-6.1-terra` (hasil uji, `eval/HASIL_UJI_MODEL.md`) |
| `OPENAI_PRICE_INPUT_PER_M`, `OPENAI_PRICE_OUTPUT_PER_M` | ✅ | ✅ | `1.0`, `5.0` — **wajib** bila key diisi (dipakai menghitung batas biaya) |
| `OPENAI_REASONING_EFFORT` | ✅ | ✅ | `low` |
| `DAILY_AI_BUDGET_USD` | ✅ | ✅ | `5` (atau sesuai kesepakatan tim) |
| `FEATURE_STORY`, `FEATURE_RECOGNITION` | ✅ | ✅ | `false` sampai cerita materi demo ditinjau; `true` untuk demo. Biaya storyline foto unggahan ±$0,30–0,37 |
| `CHECKPOINT_COUNT` | | ✅ | `2` (showcase; `1` = versi awal) |
| `WORKER_CONCURRENCY` | | ✅ | `2` (jalur paralel; memori ±1,2 GB per jalur) |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | | ✅ | `60` bila `drainingSeconds` di `railway.worker.toml` tidak terbaca |
| `LINEART_METHOD`, `MASK_MODEL` | | ✅ | `teed`, `u2net` |

### Database produksi vs dev/tes

| | Supabase | Dipakai oleh |
| --- | --- | --- |
| Produksi | Singapura `xcksxhiablzenpiwkkak` | Railway `api` + `worker` (variabel di Settings) |
| Dev/tes | Tokyo `kwsdjpxlvmjxlqmvbylf` | `api/.env`: pytest, server & worker lokal |

Tes tidak boleh menyentuh produksi: worker Railway akan mengambil job tes. `pytest` berhenti bila `ENVIRONMENT=production`. Operasi sengaja ke produksi (impor koleksi, storyline koleksi) memakai `RERUPA_ENV_FILE=.env.prod`. Migrasi baru diterapkan ke **kedua** project.

## 3. Batas biaya (dua lapis)

1. **Dashboard OpenAI** (akun Xavier): Settings → Limits → set *monthly budget* + notifikasi email. Ini pengaman terakhir bila aplikasi salah hitung.
2. **Aplikasi**: `DAILY_AI_BUDGET_USD`. Setiap panggilan dicatat di `ai_usage`; saat total hari ini ≥ batas, AI berhenti dipanggil dan tutorial/feedback memakai templat. Log `ai_budget_warning` muncul di 50% dan 80%, `ai_budget_exceeded` di 100%.

## 4. Yang dilindungi di produksi

- Rate limit per IP (600/menit, longgar untuk peserta di satu Wi-Fi), per sesi (180/menit), buat sesi (60/jam/IP), unggah foto (80/jam/IP) → 429 `rate_limited` + `Retry-After`. Penghitung di memori proses API → **jalankan 1 instance API**; bila diskalakan, pindahkan ke Redis.
- Permintaan yang mengubah data dari origin selain `FRONTEND_ORIGIN` → 403.
- Header `nosniff`, `no-referrer`, `DENY` frame, `no-store` untuk data sesi, HSTS.
- Job melewati batas tunggu (tutorial 60 s, feedback 45 s, + 15 s) → `failed/worker_timeout`, tidak memakan kuota. Penyapunya `pg_cron` (`sweep_jobs`, tiap 30 s), jadi tetap berjalan walau worker mati.
- Redeploy worker: SIGTERM → berhenti mengambil job baru, job berjalan diselesaikan (draining 60 s).
- `/health` melaporkan antrean: `oldest_queued_seconds > 30` → `degraded` (worker mati/kewalahan).

## 5. Sebelum uji pengguna / demo

- Worker butuh ±30–70 s memuat model saat start: **deploy minimal 2 menit sebelum dipakai**, lalu jalankan smoke test sekali (job pertama juga memanaskan cache).
- Terbitkan minimal 1 materi koleksi (setelah ditinjau):
  ```bash
  uv run --group cv python scripts/import_collection.py ../content/artworks/<slug> --publish
  ```
  Materi koleksi diproses saat impor, jadi saat demo tidak menunggu AI.
- Ukur P95 (≥20 putaran) setelah deploy, naikkan sementara `RATE_LIMIT_UPLOADS_PER_IP_HOUR` ke ≥40 selama pengukuran:
  ```bash
  uv run --group cv python scripts/measure_p95.py --base-url https://<domain-api> --runs 20 --out ../eval/P95_PRODUKSI.md
  uv run python scripts/report_ai.py --days 7 --out ../eval/LAPORAN_AI.md
  ```
- Retensi berjalan otomatis (worker tiap 15 menit + `pg_cron`); log `retention_done` menunjukkan jumlah yang dibersihkan.
- Pantau log Railway: `job_finished` (durasi), `overdue_jobs_failed`, `ai_budget_warning`, `unhandled_error`.
