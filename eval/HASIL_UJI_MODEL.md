# Hasil uji model OpenAI (tugas A teks tahapan, tugas B feedback)

Tanggal: 21 Nov 2026 · skrip: [`run_models.py`](run_models.py) · output lengkap: `eval/out/models/` (tidak di-commit)

## Cara uji

- **Data:** 4 materi koleksi (gambar domain publik/terbuka, bukan foto pengguna): Penangkapan Pangeran Diponegoro (bervolume), Lukisan Kain Bali (datar), Sarung Batik Buketan (datar), Sawah Berundak (lanskap).
- **Tugas A:** pipeline CV + `stage_planner` (8 tahap) → `write_lesson_text` dengan prompt, validator, retry 1×, dan perbaikan paksa yang sama dengan produksi. Input: foto + gambar region bernomor + JSON tahapan.
- **Tugas B:** foto progres sintetis (sketsa digeser 7% ke kanan) → CV checkpoint → `write_feedback` (maks 2 saran dari kandidat).
- **Pengaturan:** Responses API + structured output, `reasoning.effort = low`.
- **Harga** (per 1 juta token, input/output, halaman harga OpenAI 21 Nov 2026): gpt-6.2-sol $2/$10, gpt-6.1-terra $1/$5, gpt-6-luna $0,10/$0,50.

## Hasil angka

| Model | Tugas | Lolos validator di percobaan 1 | Perlu retry | Teks diganti templat | Latensi rata-rata | Token masuk / keluar | Biaya rata-rata |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6.2-sol | A teks tahapan | **4/4** | 0/4 | 0/4 | 26,4 s | 5.270 / 1.772 | $0,0283 |
| gpt-6.1-terra | A teks tahapan | **4/4** | 0/4 | 0/4 | 17,6 s | 5.150 / 1.349 | $0,0119 |
| gpt-6-luna | A teks tahapan | 2/4 | 2/4 | **2/4** (sebagian tahap) | 27,6 s | 5.216 / 1.675 | $0,0020 |
| gpt-6.2-sol | B feedback | 2/2 | 0 | 0 | 3,8 s | 1.120 / 100 | $0,0033 |
| gpt-6.1-terra | B feedback | 2/2 | 0 | 0 | 2,8 s | 1.090 / 76 | $0,0015 |
| gpt-6-luna | B feedback | 2/2 | 0 | 0 | 2,2 s | 1.088 / 84 | $0,0002 |

Tugas B hanya 2 dari 4 materi yang memanggil AI: pada batik dan sawah, CV tidak menemukan kandidat masalah sehingga feedback ditulis templat tanpa AI (lihat "Temuan lain").

## Hasil tinjauan teks (dibaca manual)

| | gpt-6.2-sol | gpt-6.1-terra | gpt-6-luna |
| --- | --- | --- | --- |
| Kejelasan tindakan | Paling spesifik: "garis luar kepala, bahu, dan pakaian panjang tokoh tengah… tunda rincian wajah" | Benar dan rapi, sedikit lebih umum: "sketsakan letak tokoh dan bentuk besar pakaian" | Umum dan berulang |
| Alat | Konkret ("kuas pipih 12 mm", "kuas bulat no. 4") | Cukup ("kuas pipih ukuran 8") | Umum ("kuas ukuran besar") |
| Label region | Kaya dan tepat ("Kain terang di dada", "Lengan kiri tokoh tengah") | Tepat | Sedikit (1–8 label) |
| Aturan karya datar | Patuh | Patuh | **Melanggar** (menyuruh bayangan/gradasi) di 2/4 materi, juga setelah retry |
| Feedback | Natural, menyebut nama bagian ("sisi kanan kain bawah tokoh tengah") | Natural | Cukup, kadang memakai nomor ("bidang nomor 17") |

Klaim budaya dari AI kosong di semua model: basis pengetahuan budaya (`culture_entries`) belum diisi, dan prompt melarang menebak. Materi koleksi tetap memakai klaim kurasi dari `meta.json`.

## Keputusan

| Pemakaian | Model | Alasan |
| --- | --- | --- |
| **Mode bebas** (teks tahapan, pengguna menunggu) | **gpt-6.1-terra** | Lolos validator 4/4, kualitas baik, ±18 s. Tutorial mode bebas = CV ±12–15 s + AI ±18 s ≈ 30–35 s, aman di bawah batas 60 s. gpt-6.2-sol (±26 s) membuat total ±40–45 s, terlalu dekat batas di server yang lebih lambat. |
| **Feedback checkpoint** | **gpt-6.1-terra** | ±3 s, natural, murah |
| **Impor materi koleksi** (sekali, tidak ditunggu pengguna) | **gpt-6.2-sol** | Teks paling spesifik; latensi tidak masalah. Jalankan impor dengan variabel model + harga sol (lihat `api/README.md`). |
| Tidak dipakai | gpt-6-luna | Melanggar aturan karya datar; penghematan biaya tidak sebanding |

Perkiraan biaya per pengguna (1 tutorial mode bebas + 2 feedback) dengan gpt-6.1-terra: **±$0,015**. Batas harian `DAILY_AI_BUDGET_USD=5` ≈ 330 tutorial per hari.

## Temuan lain

> **Sudah diperbaiki** (lihat [HASIL_CHECKPOINT_NYATA.md](HASIL_CHECKPOINT_NYATA.md)): deteksi "seluruh sketsa bergeser" ditambahkan; pada 4 materi nyata 20/20 kasus sesuai harapan (sebelumnya 4/20).


- **Kandidat checkpoint pada materi nyata belum sebaik pada gambar sintetis.** Sketsa yang digeser 7% ke kanan:
  - Diponegoro dan kain Bali: CV mengusulkan "sisi kanan bidang X lebih lebar/sempit", bukan "seluruh sketsa bergeser". Saran tetap menunjuk ke arah yang benar, tetapi kurang tepat.
  - Batik dan sawah: tidak ada kandidat sama sekali.
  
  Penyebab yang diduga: pada tutorial nyata, bentuk besar banyak yang menyentuh tepi gambar atau berupa motif kecil terpisah, sehingga sisi kiri/kanan tidak terukur. Perlu deteksi pergeseran global (seluruh sketsa) dan uji dengan foto progres nyata (`eval/run_checkpoint.py`).
- Peringatan `HF_TOKEN` dari Hugging Face saat CV memuat model hanyalah info rate limit unduhan; bobot model sudah ada di cache.
