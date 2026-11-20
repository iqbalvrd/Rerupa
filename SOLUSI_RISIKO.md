# Solusi Risiko Teknis — Rerupa

Versi: 1.1 · 20 November 2026 · Pelengkap [RENCANA_PENGERJAAN.md v1.2 §7](RENCANA_PENGERJAAN.md) dan [PRD v1.3](PRD_Rerupa_v1.3.md)

Perubahan v1.1: disesuaikan dengan PRD v1.3 — OpenAI satu-satunya penyedia AI (DeepSeek hanya opsi teks tanpa foto), pembagian tahap oleh kode sudah jadi cara utama, tap 4 sudut jadi default checkpoint, storyline cerita (§7–8) berstatus P1, model gambar `gpt-image-2.6-*`, tambah risiko garis sketsa berisik (§0).

Dokumen ini mengubah tiap baris tabel risiko menjadi solusi yang bisa dikerjakan. Setiap solusi punya **pencegahan** (dibangun sejak awal), **deteksi** (angka yang dipantau), dan **cadangan** (kalau tetap terjadi). Hasil riset dan sumbernya ada di akhir dokumen; angka dari blog pihak ketiga ditandai "perlu dicek".

---

## 0. Garis sketsa berisik dari tekstur kanvas

**Akar masalah:** Canny/XDoG pada foto lukisan ikut menangkap tekstur kanvas, serat kain, dan pantulan cahaya, sehingga garis bantu penuh bintik dan garis pendek.

**Solusi (`cv/lineart.py`):**
1. **Model lineart sebagai utama** (API atau open-source), yang menghasilkan kontur lebih bersih.
2. **Uji di 5 foto** (minimal 1 Raden Saleh, 1 Kamasan, 1 foto kanvas bertekstur): bandingkan model lineart vs XDoG/Canny; pilih yang paling sedikit menangkap tekstur. Simpan overlay di `eval/lineart/`.
3. **Cadangan XDoG/Canny yang diperkuat:** filter penjaga tepi lebih dulu (bilateral/mean-shift), buang komponen garis yang lebih pendek dari ambang, lalu sederhanakan path.
4. **Garis bentuk besar dari mask/region, bukan dari detektor tepi:** untuk tahap sketsa, garis objek utama diambil dari kontur mask rembg dan batas region besar — otomatis bersih.

**Deteksi:** jumlah segmen garis per luas, persentase segmen sangat pendek.

---

## 1. Region k-means terlalu banyak/berantakan

**Akar masalah:** k-means hanya mengelompokkan warna per piksel, jadi satu warna bisa pecah menjadi ratusan pulau kecil. Satu makalah vektorisasi mencatat 2.418 komponen dari k-means turun menjadi 151 region setelah penggabungan berbasis luas.

**Solusi (pipeline baru di `cv/regions.py`):**

1. **Haluskan dulu, jangan langsung k-means.** Pakai filter yang menjaga tepi: `cv2.pyrMeanShiftFiltering` atau Kuwahara, lalu Gaussian ringan. Tekstur kain/kertas hilang, tepi bentuk tetap.
2. **Kuantisasi ke palet yang bisa dicampur** (lihat juga §9): pusat cluster k-means di ruang CIELAB dipetakan ke warna terdekat yang bisa dibuat dari palet cat pengguna. Warna yang mirip setelah pemetaan otomatis bergabung.
3. **Luas minimum berdasarkan ukuran kertas, bukan piksel.** Region yang lebih kecil dari yang bisa dilukis pemula tidak berguna. Aturan: luas minimum = ±1 cm² pada ukuran bidang pilihan pengguna (A4 ≈ 0,16% gambar; A3 ≈ 0,08%). Ukuran kuas terkecil di daftar alat ikut menentukan.
4. **Gabung region kecil ke tetangga yang berbagi batas paling panjang** (bukan sekadar dihapus — menghapus meninggalkan lubang). Bila seri, pilih tetangga dengan ΔE2000 terkecil. Implementasi siap pakai: Region Adjacency Graph di scikit-image (`skimage.graph.rag_mean_color` + `merge_hierarchical`).
5. **Haluskan batas**: morfologi open/close, lalu `approxPolyDP` + Chaikin smoothing sebelum diubah ke path SVG.
6. **Batas jumlah region** sesuai level: pemula ≤ 35 region, maksimal 8 warna. Jika masih lebih, naikkan luas minimum otomatis 1,5× dan ulangi (maks 3 iterasi).

**Alternatif bila hasil masih kotor:** superpiksel SLIC (`skimage.segmentation.slic`) lalu RAG merging; lebih rapi untuk foto karya yang bertekstur.

**Deteksi:** jumlah region, persentase region < luas minimum, panjang total batas per luas (indikator "berantakan"). Simpan overlay di `eval/` untuk 20 foto uji.

**Cadangan:** tawarkan potongan (crop) area yang lebih kecil — lebih sedikit region per bidang.

---

## 2. Teks tahapan gagal validasi (sudah dimitigasi di desain)

**Akar masalah:** structured output menjamin bentuk JSON, tetapi tidak menjamin logika (region terlewat, urutan tidak kumulatif, jumlah checkpoint salah). Sejak PRD v1.3 solusi di bawah sudah menjadi desain utama, bukan cadangan.

**Solusi — balik pembagian kerja sejak awal (bukan cadangan):**

1. **Kode yang membagi region ke tahap**, secara deterministik:
   - Tahap sketsa: garis objek utama + garis bentuk besar.
   - Tahap warna dasar: region diurutkan *latar → objek utama*, *luas → kecil*, dan untuk gaya bervolume *gelap → terang* (cat akrilik umumnya dari gelap ke terang).
   - Region < luas detail masuk tahap detail.
   - Checkpoint otomatis: setelah sketsa (versi awal); ditambah setelah region sedang (showcase).
   - Aturan lengkap 8 tahap ada di PRD v1.3 §8 dan Rencana v1.2 §4.3.
2. **AI (OpenAI) hanya mengisi yang butuh pemahaman:** gaya/teknik (`use_shading`), nama tiap kelompok region ("jubah merah Rama"), teks instruksi, kesalahan umum. (Upgrade setelah stabil: AI boleh **mengusulkan** pemindahan region lewat operasi terbatas `move_region`, `merge_stages`; kode menerapkan hanya bila validator tetap lolos.)
3. **Perbaikan otomatis, bukan retry penuh:** pelanggaran kecil diperbaiki kode (region terlewat → masuk tahap detail; jumlah tahap 9 → dua tahap detail digabung). Retry ke OpenAI hanya untuk teks yang kosong atau melanggar aturan budaya.
4. **Skema sempit:** pakai enum untuk `technique`, `layers`, dan `region_id` (enum diisi daftar region aktual per permintaan), sehingga model tidak bisa menyebut region yang tidak ada.

**Deteksi:** % lolos validator tanpa perbaikan, % lolos setelah perbaikan otomatis, jenis pelanggaran terbanyak.

**Target:** ≥95% tutorial tampil (setelah perbaikan otomatis), bukan 70%.

---

## 3. Generate terlalu lama (P95 > 40 detik)

**Solusi:**

1. **Paralelkan:** setelah CV selesai, jalankan bersamaan (a) OpenAI untuk teks tahap, (b) (P1) OpenAI untuk storyboard cerita, (c) perhitungan resep warna. Tahapan visual sendiri **sudah bisa ditampilkan** begitu CV + pembagian region oleh kode selesai (±5 detik), sebelum teks AI datang.
2. **Streaming per tahap:** UI menampilkan tahap 1–2 begitu teksnya masuk; tahap lain menyusul.
3. **Kecilkan masukan ke model:** gambar 1024 px untuk analisis gaya (cukup untuk mengenali tokoh), tabel region ringkas (id, hex, luas, peran), tanpa koordinat path.
4. **Prompt caching:** instruksi sistem + basis budaya + palet ditaruh di awal dengan urutan dan isi yang tetap, sehingga prompt caching otomatis OpenAI untuk awalan yang sama bisa berlaku. Pakai model kecil untuk tugas ringan (hasil uji 2–3 model).
5. **Ukuran model per tugas** diukur, bukan ditebak: mulai dari model kecil untuk teks tahap; naik ke model besar hanya bila kualitas turun pada set uji.
6. **Pra-hitung materi koleksi** — demo utama tidak menunggu sama sekali.

**Deteksi:** catat waktu tiap fase (unggah, CV, LLM, validasi) per job; laporkan P50/P95 dengan ukuran sampel.

**Cadangan:** setelah 40 detik tampilkan tahapan visual tanpa teks AI + instruksi templat generik per jenis tahap, dengan tombol "muat ulang instruksi".

---

## 4. Pelurusan foto progres gagal (sering `needs_retake`)

**Default sejak PRD v1.3: tap 4 sudut manual** dengan kaca pembesar (loupe) di bawah jari — paling sederhana dan cukup andal untuk versi 27 Nov. Lapisan di bawah adalah upgrade, urut dari paling andal:

1. **Penanda sudut ArUco (paling andal untuk demo):** sediakan "bingkai kerja" PDF berisi 4 marker ArUco di sudut, atau stiker marker yang ditempel di sudut kertas/kanvas. OpenCV (`cv2.aruco`) mendeteksinya cepat dan tahan cahaya buruk; homografi jadi pasti.
2. **Deteksi tepi kertas langsung di HP:** pakai **jscanify** (opencv.js) atau **Scanic** (WASM, lebih cepat) di kamera live. Garis sudut digambar di layar, berwarna hijau saat stabil, dan **otomatis memotret** setelah stabil ±1 detik.
3. **Model deteksi sudut di server:** **DocAligner** (PyTorch, `pip install docaligner-docsaid`) untuk foto yang gagal di HP — lebih kuat pada latar ramai.
4. **Penyelarasan halus pada tahap sketsa:** ECC (`cv2.findTransformECC`) dijalankan pada peta tepi (bukan warna), karena sketsa pensil dan target berbeda warna.

**Panduan memotret di UI:** letakkan karya di permukaan kontras (mis. meja gelap untuk kertas putih), cahaya dari samping jendela, HP sejajar.

**Deteksi:** % foto lolos otomatis per metode; alasan `needs_retake` (buram, sudut tidak ketemu, ECC tidak konvergen).

---

## 5. Biaya API membengkak

**Perkiraan biaya per tutorial lengkap** (kasar, perlu diukur ulang):
- OpenAI teks/vision (teks tahap + feedback; P1: storyboard + pemeriksa panel): dihitung ulang setelah model dipilih dari uji 2–3 kandidat.
- OpenAI GPT Image (≤6 panel): ditagih per token (dokumentasi Nov 2026: GPT-Image-2.5 $8/juta token gambar masuk dan $30/juta token gambar keluar; GPT-Image-2.6 $30/juta token gambar keluar). Situs pihak ketiga memperkirakan ±$0,025–0,055 per gambar 1024×1024 tergantung kualitas, sehingga ±$0,15–0,35 per storyline. Gambar referensi ikut dihitung sebagai token masuk — *ukur ulang dengan model 2.6*.

**Solusi:**

1. **Cache berlapis:**
   - Hash SHA-256 file → hasil identik langsung dipakai ulang.
   - Perceptual hash (pHash) + cocok koleksi → pakai materi kurasi, nol biaya AI.
   - Panel cerita koleksi dibuat sekali, disimpan permanen.
2. **Kuota:** per sesi (3 tutorial, 2 checkpoint, 1 storyline ≤6 panel, 1 regenerasi/panel); per IP; **batas pengeluaran harian global** — saat tercapai, fitur AI baru dimatikan dan aplikasi beralih ke materi koleksi.
3. **Prompt caching** untuk bagian statis (lihat §3).
4. **Panel cerita hemat:** foto bebas memakai `quality: "medium"` dan `gpt-image-2.6-flare`; `"high"` + `gpt-image-2.6-sunburst` hanya untuk panel koleksi yang dibuat sekali. Batasi jumlah gambar referensi per panel (karya utuh + maks 3 potongan tokoh + panel sebelumnya), karena semuanya ditagih sebagai token masuk.
5. **Lapisan biaya terlihat:** tabel `ai_usage` mencatat token/gambar per job → dasbor sederhana untuk tim.

**Deteksi:** biaya per tutorial dan per hari; alarm pada 50% dan 80% batas harian.

---

## 6. Akses model gambar OpenAI tertunda (P1)

**Solusi:**

1. **Antarmuka penyedia gambar** `ImageProvider` dengan dua implementasi: `PlaceholderProvider` dan `OpenAIImageProvider`, dipilih lewat env `IMAGE_PROVIDER`. Kode lain tidak tahu bedanya, dan penyedia bisa diganti lagi tanpa membongkar alur.
2. **Cek akses sekarang:** API key sudah ada (akun OpenAI Xavier). Cek di Playground tab Images bahwa `gpt-image-2.6-*` bisa dipakai; bila diminta verifikasi organisasi, ajukan segera karena prosesnya di luar kendali tim.
3. **Placeholder yang berguna:** panel berisi potongan karya asli + narasi + label "Contoh — ilustrasi AI belum aktif". UI, alur, validator, dan uji end-to-end bisa selesai tanpa key.
4. **Rekam fixture:** begitu key ada, simpan respons nyata untuk 3 karya sebagai fixture tes, supaya tes tidak memanggil API.
5. **Begitu key datang:** jalankan skrip `scripts/pregen_story.py` untuk semua materi koleksi, tinjau, lalu terbitkan.
6. Selama menunggu, prompt panel bisa disusun dan diuji di sisi teks (storyboard) — bagian ini tidak bergantung pada akses model gambar.

---

## 7. (P1) Tokoh tidak konsisten antar panel

**Temuan riset:** dokumentasi OpenAI sendiri menyebut tokoh yang muncul berulang **bisa tidak konsisten** antar generasi — jadi konsistensi harus dibangun, bukan diharapkan. Yang tersedia: beberapa gambar referensi dalam satu permintaan (contoh resmi memakai 4), **multi-turn lewat Responses API** (`previous_response_id` atau merujuk ID image generation call sebelumnya), parameter `action: "edit"`, dan model **Sunburst** yang disebut paling presisi untuk edit.

**Solusi:**

1. **Referensi tokoh diambil dari karya asli:** potong tiap tokoh dari lukisan memakai `region_ids` + bbox dari CV → dijadikan gambar referensi tokoh. Jadi model melihat Rama yang *sebenarnya* di lukisan, bukan hanya deskripsi teks.
2. **Referensi gaya:** karya asli utuh selalu disertakan, dan di prompt disebut perannya ("gambar 1 = acuan gaya; gambar 2–4 = acuan tokoh").
3. **Pilih model sesuai kebutuhan:** `gpt-image-2.6-sunburst` untuk aset final/panel koleksi (edit lebih konsisten); `gpt-image-2.6-flare` untuk draf dan foto bebas (lebih cepat).
4. **Multi-turn per storyline:** panel dibuat berurutan; setiap panel baru dikirim dengan `previous_response_id` dari panel sebelumnya dan instruksi "pertahankan wajah, mahkota, warna kulit, dan pakaian tokoh; ubah hanya adegan".
5. **Lembar tokoh dulu (opsional, bila tetap tidak konsisten):** buat satu gambar "lembar tokoh" berisi semua tokoh utama dalam gaya karya, tinjau, lalu pakai lembar itu sebagai referensi semua panel.
6. **Deskripsi tokoh terkunci** (`characters[].lock`) diulang persis sama di setiap prompt panel.
7. **Batasi:** maks 3 tokoh utama per panel, maks 4–6 panel.
8. **Pemeriksa otomatis:** OpenAI (vision) membandingkan tiap panel dengan potongan referensi tokoh dan checklist atribut → `konsisten` / `tidak`. Tidak konsisten → 1 regenerasi; masih gagal → panel itu diganti kartu narasi teks.

**Deteksi:** % panel lolos pemeriksa otomatis; uji manusia "tokoh sama?" pada set uji (target ≥80% storyline).

---

## 8. (P1) Panel keliru secara budaya

**Solusi:**

1. **Checklist atribut di basis budaya:** tiap tokoh/kisah di `culture_kb.json` punya atribut wajib dan larangan (mis. warna kulit, mahkota, senjata, warna busana; "tidak digambarkan …"), beserta sumbernya. Checklist ini dipakai di prompt **dan** di pemeriksa.
2. **Pemeriksa budaya otomatis:** OpenAI (vision) menilai tiap panel terhadap checklist → daftar pelanggaran. Ada pelanggaran → regenerasi dengan instruksi koreksi spesifik; gagal lagi → kartu teks.
3. **Daftar terbatas narasumber:** tokoh/adegan sakral tidak digenerate sama sekali (diperiksa sebelum memanggil GPT Image).
4. **Tinjauan manusia untuk koleksi:** panel koleksi berstatus `draf → ditinjau → terbit`, sama seperti materi.
5. **Untuk foto bebas:** label lebih tegas "Ilustrasi AI — bisa tidak akurat secara budaya", tombol **"Laporkan panel ini"** (masuk antrean tinjauan), dan opsi "tampilkan cerita teks saja".
6. Tambahkan label "Ilustrasi AI" yang terlihat di UI dan watermark kecil di gambar; jangan bergantung pada metadata penyedia untuk penandaan.
7. Permintaan yang ditolak moderasi OpenAI (`moderation_blocked`) dicatat beserta kategorinya, lalu panel diganti kartu teks — jangan otomatis menurunkan `moderation` ke `low`.

**Deteksi:** jumlah laporan per panel; pelanggaran checklist per kisah.

---

## 9. Warna perkiraan jauh dari aslinya (ΔE besar)

**Akar masalah:** model pencampuran digital tidak mengenal cat spesifik kita, foto ponsel tidak terkalibrasi, dan riset menunjukkan prediksi campuran dengan **putih** adalah titik paling lemah model Kubelka–Munk.

**Solusi:**

1. **Kalibrasi foto swatch:** foto semua swatch bersama **kartu warna (ColorChecker)** di bawah cahaya yang sama; koreksi warna otomatis memakai `colour-checker-detection` + `colour-science`. Hex palet jadi jauh lebih akurat.
2. **Tabel campuran terukur, bukan hanya model:** untuk tiap cat, buat dan foto *tint ladder* dengan putih (1:1, 1:2, 1:4) dan *masstone*; untuk pasangan cat yang sering dipakai, campuran 1:1 dan 2:1. Riset menunjukkan masstone + satu–dua tint sudah cukup untuk kalibrasi model dua konstanta.
3. **Prediksi = model + koreksi data:** model pencampuran (Mixbox atau spectral.js) memberi perkiraan, lalu dikoreksi dengan selisih rata-rata terhadap swatch terukur terdekat. Campuran yang punya swatch terukur langsung memakai data nyata.
4. **Kuantisasi dibatasi gamut palet** (terhubung ke §1): warna region dipetakan ke warna yang bisa dicapai palet sejak awal, sehingga tidak ada region yang "tidak punya resep".
5. **Ambang tampil:** ΔE2000 ≤ 3 → "resep"; 3–8 → "perkiraan, uji sedikit dulu"; > 8 → "sulit dicapai dengan palet ini" + saran cat tambahan.
6. **Resep ditulis bertahap:** "mulai dari 2 bagian A, tambahkan B seujung kuas sampai…", bukan rasio kaku, plus cara koreksi (terlalu terang → tambah …).
7. **Lisensi:** Mixbox berlisensi CC BY-NC (non-komersial; komersial perlu lisensi berbayar — konfirmasi di situs resminya). **spectral.js** berlisensi MIT dan bisa dipakai di frontend; untuk backend Python logikanya cukup kecil untuk diport. Untuk hackathon boleh Mixbox; untuk produk, rencanakan spectral.js atau model sendiri.

**Deteksi:** ΔE2000 rata-rata antara prediksi dan swatch fisik kering pada 15–20 campuran uji.

**Cadangan:** materi demo hanya menampilkan resep teruji fisik.

---

## 10. Ringkasan perubahan ke rencana

| Area | Perubahan |
| --- | --- |
| CV | Luas minimum berbasis cm², RAG merging, kuantisasi terikat gamut palet |
| Rencana tahap | Pembagian region oleh kode (`stage_planner`, cara utama); AI menamai dan menulis; perbaikan otomatis |
| Latensi | Tahapan visual tampil sebelum teks AI; tugas LLM paralel; streaming per tahap |
| Checkpoint | Marker ArUco + jscanify/Scanic di HP + DocAligner + tap manual |
| Biaya | Cache berlapis, kuota, batas harian, tabel `ai_usage` |
| GPT Image | `ImageProvider` + placeholder; verifikasi organisasi sedini mungkin; referensi tokoh dari potongan karya asli; multi-turn `previous_response_id`; pemeriksa konsistensi & budaya oleh OpenAI vision (P1) |
| Warna | Kalibrasi ColorChecker, tint ladder, model + koreksi data, ambang ΔE |
| Fase 0 | Tambah: cetak marker ArUco, foto tint ladder, uji lineart vs XDoG, uji 2–3 model OpenAI teks/vision, cek akses `gpt-image-2.6-*` |

---

## Sumber riset

- Region merging & paint-by-numbers: [A Formalization of Image Vectorization by Region Merging (arXiv)](https://arxiv.org/html/2409.15940v1), [Img2Num — mergeSmallRegionsInPlace](https://ryan-millard.github.io/Img2Num/info/docs/reference/wasm/modules/image/mergeSmallRegionsInPlace/overview), [Paint by numbers pipeline (CS184 slides)](https://docs.google.com/presentation/d/1bAHt2NOgSPNQt2QOmSQW8GgZr-FddmBalW0Ylyy1lyI/htmlpresent), [Statistical region merging](https://en.wikipedia.org/wiki/Statistical_region_merging), [Diskusi McNeel "paint by numbers"](https://discourse.mcneel.com/t/create-a-paint-by-numbers-script/147595)
- OpenAI GPT Image: [Panduan image generation (resmi)](https://developers.openai.com/api/docs/guides/image-generation), [GPT Image (Wikipedia)](https://en.wikipedia.org/wiki/GPT_Image), [Kalkulator harga OpenAI Images (costgoat)](https://costgoat.com/pricing/openai-images), [Analisis harga Google vs OpenAI (IntuitionLabs)](https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai) — harga pihak ketiga perlu dicek
- Ketentuan data OpenAI API: [Your data (resmi)](https://developers.openai.com/api/docs/guides/your-data), [Komitmen zero data retention](https://openai.com/index/our-commitment-to-zero-data-retention)
- Deteksi sudut & pelurusan: [DocAligner (PyPI)](https://pypi.org/project/docaligner-docsaid/), [jscanify](https://docsearch.algolia.com/mcp/docs/repo/puffinsoft/jscanify), [Scanic](https://marquaye.github.io/scanic), [Dropbox — document detection](https://dropbox.tech/machine-learning/fast-and-accurate-document-detection-for-scanning)
- Pencampuran warna: [spectral.js (npm, MIT)](https://npmjs.com/package/spectral.js), [Mixbox](https://pub.dev/documentation/mixbox), [Lisensi CC BY-NC 4.0 pada paket Mixbox](https://www.nuget.org/packages/Mixbox/0.0.1/License), [Kubelka–Munk theory](https://en.wikipedia.org/wiki/Kubelka%E2%80%93Munk_theory), [Optimal learning samples untuk KM dua konstanta (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9283763/), [Perceptual reflectance weighting for KM (Centore)](https://Munsellcolourscienceforpainters.com/ColourSciencePapers/PerceptualReflectanceWeightingForKubelkaMunk.pdf), [KM untuk media opak (Springer 2018)](https://link.springer.com/article/10.1007/s11998-018-0056-5)
