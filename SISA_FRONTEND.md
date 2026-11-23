# Sisa kerja frontend (Xavier)

Per 22 Nov 2026, sore. Target versi awal: **26–27 Nov**.

## Sudah selesai

| Bagian | PR |
| --- | --- |
| Fondasi: Next.js, klien API, sesi, polling job | #10 |
| Galeri museum 3D + logo | #11 |
| Detail karya + transisi "mendekat ke lukisan" | #12 |
| Persiapan + mock API dev | #13 |
| Ruang latihan (StageCanvas, lapisan, resep warna, progres) | #14 |
| Checkpoint (foto, tap 4 sudut, feedback) | #15 |
| Unggah mode bebas | #16 |
| Halaman Selesai, landing 3D museum, pintu neoklasik, masuk galeri tanpa loading bertahap, galeri tanpa jendela | #26 (open, CI hijau, tinggal merge) |

Semua layar P0 sudah ada. Sudah dites dengan **API asli**: unggah → tutorial → Persiapan → ruang latihan; galeri sudah berisi karya terbit.

---

## 1. Wajib sebelum 27 Nov

| # | Kerjaan | Perkiraan | Catatan |
| --- | --- | --- | --- |
| 1 | **Merge #26** | 1 menit | CI hijau, tidak konflik dengan kerjaan Iqbal |
| 2 | **Jeda polling job** | 15 menit | `API.md` sekarang: tiap 1 s selama 10 s pertama, lalu tiap 2 s. `JOB_POLL_INTERVAL_MS` di `web/lib/jobs.ts` masih 1 s tetap |
| 3 | **Deploy web ke Vercel** | ±1 jam | Ikuti `RENCANA_DEPLOY.md` (Iqbal): Railway dulu, baru Vercel (Root Directory `web`). `NEXT_PUBLIC_API_BASE_URL` = domain API Railway. Kirim domain Vercel ke Iqbal untuk `FRONTEND_ORIGIN` |
| 4 | **Tes di HP sungguhan** (Android Chrome + iPhone Safari) | 1–2 jam | Kamera, sudut dan kotak potong, landing 3D (berat?), transisi masuk galeri, cookie sesi lintas domain di iPhone (lihat K2 di `RENCANA_DEPLOY.md`) |
| 5 | **Tes alur lengkap dengan API asli** | ±1 jam | Galeri → detail → latihan → checkpoint → Selesai, foto progres nyata |

## 2. P1: Storyline cerita (UI)

Backend sudah jadi (Iqbal). UI belum. Detail lengkap, kontrak, dan peta kode: **[STORYLINE_UI.md](STORYLINE_UI.md)**. Dikerjakan di sesi terpisah.

Ada dua versi alur foto unggahan: versi konfirmasi "Apakah ini …?" (`main`) dan versi agen riset (branch `feat/story-agen-riset`, belum merge). Pastikan dengan Iqbal mana yang dipakai.

## 3. Bukan kode, tapi bagianku

| # | Kerjaan | Ke siapa |
| --- | --- | --- |
| 1 | Pasang **batas pengeluaran** di dashboard OpenAI | Sendiri (`HANDOFF.md §4`) |
| 2 | **Ganti key OpenAI**: key lama pernah ditempel di chat | Sendiri, lalu kabari Iqbal |
| 3 | Lapor: worker crash saat koneksi Supabase putus (`httpx.RemoteProtocolError ConnectionTerminated`), perlu sambung ulang | Iqbal |
| 4 | Kirim domain Vercel untuk CORS | Iqbal |
| 5 | Minta `FEATURE_STORY=true` di lokal/Railway untuk tes storyline | Iqbal |
| 6 | Ikut uji 5–8 pengguna + rekam video demo | Tim |

## 4. Polish (setelah alur inti aman)

| # | Kerjaan | Perkiraan | Catatan |
| --- | --- | --- | --- |
| 1 | **Tahap yang padat**: di tahap "Objek utama" bisa muncul 19 nomor sekaligus | 1–2 jam | Kecilkan nomor atau tambah toggle "Nomor"; Iqbal baru menaikkan jadi 12 warna (#23), cek ulang |
| 2 | Pemilih gaya bingkai + favicon dari logo | 1–2 jam | Gaya Louis XVI sudah ada di `web/components/gallery/frames.ts` |
| 3 | Transisi saat tombol back bawaan browser / gestur HP | 1–2 jam | Sekarang animasi hanya lewat tombol "← Galeri" atau `Esc` |
| 4 | Audit aksesibilitas + isi `HANDOFF.md §3` (bagian frontend) | 1–2 jam | `HANDOFF.md §3` masih kosong |

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

Mode mock (tanpa backend): tambahkan `NEXT_PUBLIC_API_MOCK=1` di `web/.env.local`, lalu `npm run fixtures`.

Jangan `npm run build` saat dev server jalan (menimpa `.next`); pakai `npm run build:check`.
