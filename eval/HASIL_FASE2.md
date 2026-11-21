# Hasil Evaluasi CV — Fase 2

Uji pipeline CV pada foto lukisan nyata untuk memilih metode garis, model mask, dan memeriksa region serta terang-gelap. Angka berasal dari laptop pengembang (CPU, tanpa GPU) dan berlaku sebagai perkiraan awal; ukur ulang di server.

## Foto uji

| Foto | Sumber | Keterangan |
| --- | --- | --- |
| `02_raden_saleh_lion_hunt` | Wikimedia Commons, domain publik | Raden Saleh, 1841 — gradasi, adegan ramai |
| `03_kamasan_death_of_abhimanyu` | Wikimedia Commons, domain publik | Lukisan klasik Bali akhir abad ke-19, Neka Art Museum — puluhan tokoh, difoto dari balik kaca (ada pantulan), warna pudar |
| `crop_02_raden_saleh_singa` | Potongan dari foto 02 | Satu kelompok figur |
| `crop_03a_kamasan_figur_kiri`, `crop_03b_kamasan_figur_tengah` | Potongan dari foto 03 | Satu figur (±430–600 px) |
| `sim_05_miring`, `sim_06_gelap`, `sim_07_tekstur_kanvas` | Simulasi dari foto 02/03 | Perspektif + latar meja; ruangan redup; anyaman kanvas buatan |

Dua foto lain (Raden Saleh *Javanese Jungle*, Kamasan *Demonic Transformation*) gagal diunduh karena dibatasi server Wikimedia (HTTP 429). **Belum ada foto HP sungguhan dari lukisan fisik** — simulasi tidak menggantikannya.

## Temuan dan keputusan

### 1. Garis sketsa

| Metode | Waktu (CPU) | Hasil |
| --- | --- | --- |
| `model` (Informative Drawings) | 2–14 s (pertama kali ±35–70 s karena memuat model) | Kontur paling informatif pada foto jelas |
| `teed` | 0,4–2,2 s | Kontur cukup baik, menangkap objek tipis (panah, tombak) |
| `xdog` | <0,25 s | Garis putus-putus pada foto nyata |
| `canny` | <0,1 s | Banyak potongan pendek (berisik) |

- **Masalah yang ditemukan:** ambang tetap tidak bisa dipakai lintas metode/foto — dengan ambang yang sama XDoG hampir kosong (0,06%) dan TEED menutupi 54% gambar.
- **Perbaikan:** ambang adaptif menuju ±4% piksel garis. Setelahnya kepadatan semua metode stabil di 1–12%.
- **Keputusan:** `LINEART_METHOD=teed` untuk mode bebas (cukup cepat), `LINEART_METHOD_COLLECTION=model` untuk materi koleksi (diproses sekali, kualitas lebih penting). `xdog` tetap cadangan otomatis bila model gagal.

### 2. Mask objek utama

| Model | Waktu | Hasil |
| --- | --- | --- |
| `isnet-general-use` | 2,3–18 s | Sangat baik pada Raden Saleh (kelompok figur terpisah dari langit/tanah) |
| `u2net` | 1,3–3,5 s | Hampir sama dengan isnet |

- Pada lukisan Kamasan yang penuh tokoh (dan potongannya), kedua model **tidak andal** — sesuai dugaan; pipeline memakai cadangan (region terbesar non-latar).
- **Keputusan:** `MASK_MODEL=u2net` (2–3× lebih cepat).

### 3. Region warna

- **Masalah yang ditemukan:** batas ≤35 region dicapai dengan menggabungkan region *terkecil*, sehingga bidang yang warnanya berbeda (rok merah, kulit, latar) ikut tergabung jadi gumpalan acak.
- **Perbaikan:** penggabungan memilih pasangan tetangga yang *warnanya paling mirip* (ΔE), region kecil sedikit diprioritaskan.
- **Hasil setelah perbaikan:** pada potongan figur Kamasan, lengan, kaki (warna kulit), rok merah, dan latar terpisah mengikuti bentuk figur. Pada Raden Saleh, langit bergradasi, tanah, dan kelompok figur menjadi massa gelap-terang yang jelas.
- **Waktu:** 2,2–7,2 s per foto. Versi pertama penggabungan warna sempat 15,7 s pada foto bertekstur kanvas; setelah penggabungan dipercepat saat kelebihan region masih banyak, turun ke 6,5 s.
- **Batasan:** lukisan utuh yang berisi puluhan tokoh tetap terlalu rumit untuk 35 region. UI perlu **mengarahkan pemula memotong satu figur** (sesuai PRD: cakupan/potongan), dan peringatan `too_complex` perlu dipicu bukan hanya dari jumlah region.

### 4. Terang-gelap

- **Masalah yang ditemukan:** pembagian tingkat per kuantil memecah latar polos jadi bercak; bintik tekstur tersisa.
- **Perbaikan:** batas tingkat dibagi rata pada rentang kecerahan nyata + penggabungan bintik kecil.
- `shading_hint` setelah region digabung berdasarkan warna: Raden Saleh 0,63–0,87; Kamasan 0,17–0,47; simulasi 0,11–0,45.
  (Sebelum perbaikan region angkanya berbeda — Raden Saleh 0,89–1,0, Kamasan sampai 0,55 — sehingga ambang 0,7 yang sempat dipilih membuat Raden Saleh utuh salah dianggap datar.)
- **Keputusan:** ambang `use_shading` **0,55**. Celah antara kedua gaya tipis, jadi angka ini hanya saran: di Fase 3 `use_shading` diputuskan bersama AI, dan untuk materi koleksi ditetapkan manual.

### 5. Kualitas foto

- Foto `sim_06_gelap` terdeteksi `too_dark`; foto lain layak.

### 6. Sumber daya

- RAM puncak proses: **1,0–1,5 GB** → server 4 GB cukup dengan 1–2 job CV paralel.
- Perkiraan waktu total mode bebas (TEED + u2net + region + render): ±6–12 s di CPU laptop — **sedikit di atas target 8 s**. Perlu diukur di server; optimasi berikutnya ada di langkah region.

## Yang masih perlu

1. Foto HP sungguhan dari lukisan fisik (miring, cahaya ruangan, kanvas asli) untuk menggantikan simulasi.
2. Foto Kamasan berkualitas lebih baik (tanpa kaca/pantulan) — foto uji saat ini pudar dan buram sehingga semua metode garis terputus-putus.
3. Ukur waktu dan RAM di server Railway/Fly.
4. Kalibrasi ambang kualitas foto (buram/gelap/silau) dengan lebih banyak foto.

## Cara mengulang

```bash
cd api
uv run --group cv python ../eval/run_cv.py
```

Foto ada di `eval/photos/` dan hasil di `eval/out/` (keduanya tidak di-commit).
