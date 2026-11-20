# PRD — Rerupa: AI Mentor Melukis Seni Nusantara

Versi: 1.3  
Tanggal: 20 November 2026  
Status: rancangan produk untuk **BUDAYA GO 2026**, kategori Inovasi Digital, subtema (usulan) Pembelajaran dan Edukasi Digital Berbasis Budaya; belum merupakan hasil implementasi atau validasi pengguna.  
Nama produk: **Rerupa**  
Bahasa utama: Indonesia.

Riwayat perubahan:
- **v1.3** (revisi Xavier): nama Rerupa dan tim ditetapkan; konteks BUDAYA GO 2026; **OpenAI satu-satunya penyedia AI** (Claude, Gemini, dan DeepSeek sebagai penyedia utama dihapus; DeepSeek hanya opsi teks tanpa foto); storyline cerita turun ke **P1**; versi awal **1 checkpoint**; pencocokan otomatis ke koleksi jadi P1; **pembagian region per tahap oleh kode**, AI hanya menulis teks; tambah **model lineart**, **layer terang-gelap** (FR17), dan **toggle foto asli** (FR18); aturan sumber materi koleksi dan EBT; jadwal 48 jam diganti jadwal BUDAYA GO; demo diperbaiki.
- v1.2: tambah storyline cerita visual 4–6 panel dengan image generation.
- v1.1: tutorial dibuat AI dari foto apa pun; konteks budaya fakta vs perkiraan.

## 0. Konteks lomba

| Aspek | Isi |
| --- | --- |
| Lomba | BUDAYA GO 2026, kategori Inovasi Digital |
| Bobot penilaian | Akar Budaya 25%, Kelayakan Teknis dan Implementasi 25%, Model Bisnis 20%, Kejelasan dan Kualitas Proposal 30% |
| Dokumen | PRD ini fokus produk. Proposal dibuat terpisah mengikuti 18 bagian format juknis |
| Tanggal penting (dari jadwal tim) | 24–25 Nov inkubasi · 26–27 Nov submit proposal + bukti produk · 7–14 Des pengembangan lanjutan (kalau lolos) · 17–19 Des showcase/demo. Tanggal resmi mengikuti juknis |

## 1. Ringkasan produk

Rerupa membantu pemula mempelajari seni Nusantara dengan mengubah karya — dari galeri terkurasi atau foto bebas — menjadi latihan melukis bertahap. Pengolahan gambar memecah karya menjadi garis, objek, bidang warna, dan (bila perlu) tingkat terang-gelap; kode membagi bagian-bagian itu ke 6–8 tahap; AI menulis instruksi dan menjelaskan budaya di baliknya. Pengguna mengunggah foto progres untuk mendapat arahan berikutnya.

Nilai utama: pembelajaran visual yang menghubungkan keterampilan melukis, alat yang tersedia, dan pengetahuan budaya.

Pernyataan produk:
> Mentor melukis berbasis AI yang membantu pengguna mempelajari seni Nusantara melalui panduan visual, pencampuran warna, dan feedback progres.

Empat peran AI dan sistem:
1. **Pembuat tahapan visual** — pengolahan gambar (CV) memecah karya menjadi lapisan dengan koordinat yang sama; **kode** (`stage_planner`) membagi region ke 6–8 tahap secara kumulatif.
2. **Pemandu melukis ulang** — AI (OpenAI) menulis instruksi per tahap (tindakan, alat, warna, patokan selesai, kesalahan umum) dan menulis saran feedback dari hasil ukur CV.
3. **Penjelas budaya** — AI menjelaskan gaya, motif, dan tradisi yang mungkin terkait. Fakta dari sumber terkurasi dibedakan dari perkiraan AI.
4. **Pencerita visual (P1)** — AI mengenali kisah yang digambarkan karya, menulis storyboard 4–6 adegan, lalu membuat panel ilustrasi dengan image generation OpenAI memakai karya asli sebagai referensi. Tokoh di cerita ditautkan ke bagian yang akan dilukis.

Pembagian teknologi: gambar **tahapan melukis** dirakit dari lapisan hasil olahan foto (bukan image generation) agar bentuk sama persis di setiap tahap; **panel cerita** (P1) dibuat dengan image generation karena tujuannya pemahaman kisah, bukan acuan bentuk.

Panduan Rerupa adalah jalur latihan yang disarankan, bukan rekonstruksi proses asli seniman; proses asli hanya disebut jika terdokumentasi.

## 2. Asumsi perencanaan

| Aspek | Keputusan |
| --- | --- |
| Platform | Web responsif, mobile-first; kamera melalui browser atau unggah galeri. Next.js + FastAPI |
| Pengguna awal | Pemula, terutama pelajar dan mahasiswa |
| Medium | Akrilik pada kertas yang sesuai atau kanvas |
| Sumber latihan | Default: pilih dari galeri 3–5 materi terkurasi. Mode bebas: unggah foto karya apa pun |
| Bentuk latihan | Seluruh karya sederhana atau potongan agar layak untuk pemula |
| Panjang tutorial | 6–8 tahap per latihan; mengikuti teknik materi |
| Pilihan tingkat | Pemula; level menengah masuk pengembangan |
| Peralatan | Satu set cat demo yang merek, seri, dan warnanya dicatat |
| Akun | Mode tamu; progres sementara pada browser yang sama |
| Penyedia AI | **OpenAI** untuk vision, teks, dan image generation. DeepSeek opsional di kemudian hari, hanya untuk tugas teks tanpa foto pengguna, bila biaya OpenAI terasa mahal |
| Tim | Xavier: mayoritas frontend, ikut backend. Iqbal: backend dan CV, ikut integrasi AI, plus bisnis. Sheva: konten budaya (basis pengetahuan, materi koleksi, sumber, lisensi, narasumber). Pembagian modul backend disepakati bersama |
| Jadwal | Mengikuti jadwal BUDAYA GO (§0, §20) |
| Monetisasi | Belum diimplementasikan; hipotesis model bisnis dibahas di proposal |

## 3. Masalah, pengguna, dan validasi

Hipotesis masalah:
- Pemula kesulitan menentukan langkah pertama dari gambar akhir.
- Tutorial umum kurang sesuai dengan referensi dan alat pengguna.
- Pemula kesulitan menerjemahkan warna pada gambar menjadi campuran cat.
- Pengguna membutuhkan arahan saat hasilnya mulai berbeda dari panduan.
- Pengamatan visual karya belum selalu disertai pemahaman budaya.

Persona utama: pelajar atau mahasiswa pemula yang memiliki HP dan alat lukis dasar, tertarik mencoba seni Indonesia, serta membutuhkan instruksi pendek dengan contoh visual.

Persona sekunder: pengajar atau fasilitator sanggar yang memerlukan materi latihan terstruktur. Dashboard kelas belum termasuk MVP.

Jobs to be done:
> Ketika menemukan karya seni Indonesia yang menarik, saya ingin memahami dan mempelajari satu bagiannya dengan alat yang saya miliki, supaya saya bisa mulai melukis dan mengetahui langkah berikutnya.

Validasi: wawancarai dan uji **5–8 calon pengguna sebelum 27 November**, bukan di akhir. Amati cara mereka memulai latihan tanpa produk, lalu uji prototipe dengan tugas yang sama. Hasil dan **2–3 kutipan testimoni** dipakai di proposal (juknis memberi nilai tambah untuk pengguna, testimoni, dan rekam jejak). Sampel ini memberi temuan awal, belum membuktikan dampak populasi.

## 4. Tujuan dan batas produk

Tujuan MVP:
1. Membantu pengguna memulai latihan tanpa perlu mencari tutorial tambahan.
2. Membuat tahap visual otomatis dari foto yang konsisten dengan referensi.
3. Memberi saran warna: perkiraan berlabel, lalu resep teruji fisik untuk materi demo.
4. Memberi satu atau dua tindakan perbaikan pada checkpoint progres.
5. Menghubungkan latihan dengan informasi budaya; fakta bersumber dan perkiraan AI dibedakan jelas.
6. Menyelesaikan satu alur demo yang bekerja dari awal sampai akhir.

Di luar MVP:
- Tutorial otomatis untuk karya yang sangat rumit, fotorealistik, atau berukuran besar tanpa pemotongan.
- Gambar generatif terpisah untuk setiap tahap.
- Rekonstruksi pasti urutan sapuan atau pigmen asli seniman.
- Pencocokan warna fisik presisi untuk semua merek cat.
- AR yang menempelkan panduan secara langsung pada kanvas.
- Dukungan cat air, minyak, digital painting, dan beragam teknik sekaligus.
- Skor keindahan, penilaian autentisitas, marketplace, pembayaran, serta jejaring sosial.

Untuk foto di mode bebas, sistem tetap membuat tutorial. Jika gambar terlalu rumit, sistem menyarankan potongan yang lebih sederhana. Jika foto tidak layak (buram, bukan karya seni, terlalu gelap), sistem meminta foto ulang. UI menjelaskan sebelum unggah bahwa tutorial dibuat otomatis dan bisa tidak sempurna.

## 5. Prioritas fitur

P0 = wajib untuk demo yang utuh. P1 = ditambahkan setelah P0 stabil. P2 = roadmap. Target: **27 Nov** (bukti produk untuk proposal) atau **showcase** (Desember).

| ID | Fitur | Prioritas | Target |
| --- | --- | --- | --- |
| F01 | Galeri materi dan detail karya | P0 | 27 Nov |
| F02 | Foto/unggah + cek kualitas. Default pengguna pilih dari galeri; pencocokan otomatis ke koleksi opsional | P0 (unggah), P1 (pencocokan otomatis) | 27 Nov / showcase |
| F03 | Pengaturan ukuran bidang dan cakupan/potongan | P0 | 27 Nov |
| F04 | Pecahan visual otomatis dari foto (lineart, objek, region warna, terang-gelap) | P0 | 27 Nov |
| F05 | Tahapan 6–8 langkah + instruksi + slider | P0 | 27 Nov |
| F06 | Resep warna (perkiraan berlabel, lalu teruji) | P0 | 27 Nov (perkiraan), showcase (teruji) |
| F07 | Checkpoint foto progres + feedback | P0, **1 checkpoint dulu** (setelah sketsa) | 27 Nov: 1 checkpoint. Showcase: 2 checkpoint |
| F08 | Konteks budaya fakta vs perkiraan | P0 | 27 Nov |
| F09 | Simpan progres, lanjutkan, hapus sesi | P0 | 27 Nov |
| F10 | Refleksi budaya di akhir | P0 | showcase |
| F15 | Storyline cerita panel ilustrasi | **P1** | showcase, kalau P0 stabil |
| F11 | Tanya per langkah | P1 | setelah showcase |
| F12 | Durasi dan level menengah | P1 | setelah showcase |
| F13, F14 | Pemindaian swatch, AR, medium lain | P2 | roadmap |

Alasan F15 turun ke P1: dev hanya dua orang, dan membuat gambar tokoh pewayangan atau tokoh suci berisiko sensitif di depan juri Kemenbud. Fitur ini menambah daya tarik, tetapi bukan inti belajar melukis.

## 6. Alur utama dan kondisi alternatif

Alur utama:
1. Pengguna membuka beranda dan melihat cakupan koleksi.
2. Pengguna memilih materi dari galeri atau mengunggah/memotret foto di mode bebas.
3. Default: materi galeri langsung dipakai; foto bebas diperiksa kualitasnya lalu diproses. (P1: pencocokan otomatis menawarkan materi koleksi bila foto cocok.)
4. Sistem menampilkan konteks budaya singkat dan mengusulkan cakupan latihan (seluruh karya atau potongan).
4a. **(P1)** Pengguna dapat membuka storyline cerita: panel kisah di balik karya, dengan tokoh yang ditautkan ke tahap melukisnya.
5. Pengguna memilih palet serta ukuran bidang.
6. Sistem membuat pecahan visual dan pembagian tahap; AI menulis teks; sistem memvalidasi lalu menampilkan persiapan dan tutorial.
7. Pengguna mengikuti tahap, membuka resep warna, membuka foto asli bila perlu, dan menandai progres.
8. Pada checkpoint (versi awal: 1, setelah sketsa; showcase: 2), pengguna bisa memotret hasil dan menerima feedback.
9. Pengguna menyelesaikan latihan, membaca rangkuman keterampilan, dan menjawab refleksi budaya.

Kondisi alternatif:
- Kamera ditolak: unggah galeri dan pilihan koleksi tetap tersedia.
- Foto buram, miring, atau memantul: beri petunjuk mengambil ulang.
- Foto bebas tanpa identitas diketahui: tutorial tetap dibuat; judul/seniman tidak ditebak; konteks budaya ditandai perkiraan.
- Gambar terlalu rumit: sistem menyarankan potongan atau versi sederhana.
- Pembuatan tutorial gagal atau teks AI tidak lolos validasi: tahapan visual tetap tampil dengan instruksi templat; tawarkan coba lagi atau materi koleksi.
- (P1) Kisah karya tidak diketahui: storyline tidak dibuat sebagai fakta; fitur dilewati atau ditandai "interpretasi AI".
- (P1) Image generation gagal atau ditolak: tampilkan storyboard teks saja.
- (P1) Beberapa kandidat koleksi mirip: tampilkan pilihan dan minta konfirmasi.
- Alat di luar palet: tampilkan kebutuhan minimum; rasio yang belum diuji tidak ditampilkan sebagai resep.
- AI gagal: tutorial yang sudah dibuat dan materi koleksi tetap bisa digunakan; tampilkan kegagalan dan tombol coba lagi.
- Jaringan terputus: tahap yang sudah dimuat tetap dapat dibaca; unggah ditunda dengan status jelas.
- Pengguna melewati checkpoint: latihan tetap dapat dilanjutkan; jangan menganggapnya telah menerima feedback.

## 7. Kebutuhan fungsional dan acceptance criteria

| ID | Kebutuhan | Acceptance criteria |
| --- | --- | --- |
| FR01 | Galeri dan detail | Tersedia 3–5 materi terbit (27 Nov: minimal 1); setiap materi mempunyai thumbnail, cakupan, alat, kredit, sumber, dan lisensi. |
| FR02 | Kamera dan unggah | JPEG/PNG/WebP sampai 10 MB diterima setelah validasi isi file; file lain ditolak dengan pesan yang membantu. Akses kamera membutuhkan tindakan pengguna. |
| FR03 | Pengenalan koleksi (P1) | Hanya berlaku bila pencocokan otomatis aktif: memakai ambang yang dikalibrasi pada foto uji dan dikonfirmasi pengguna. |
| FR04 | Ketidakpastian identitas | Foto bebas tidak diberi judul, seniman, atau asal pasti hasil tebakan. Dugaan gaya/tradisi diberi label "perkiraan AI". Skor tidak ditampilkan sebagai probabilitas kebenaran. |
| FR04a | Pembuatan tahapan | Dari satu foto ternormalisasi, `stage_planner` (kode) membagi region ke 6–8 tahap kumulatif dengan aturan default (§8); semua region tercakup; AI hanya menulis teks tiap tahap. Teks yang gagal validasi diganti templat, bukan menyembunyikan tutorial. |
| FR05 | Pengaturan latihan | Pengguna dapat memilih ukuran, cakupan, dan palet dari opsi yang didukung; pilihan tersimpan per sesi. MVP selalu memakai level pemula dan medium akrilik. |
| FR06 | Pecahan visual | Pengguna bisa mengaktifkan garis bantu (lineart), objek utama, kelompok warna, dan grid; seluruh lapisan memakai koordinat referensi yang sama. |
| FR07 | Tahap tutorial | Tiap tahap mempunyai visual target, area fokus, tindakan, alat, warna bila relevan, patokan selesai, dan bantuan kesalahan umum. |
| FR08 | Navigasi tutorial | Kembali, lanjut, zoom, slider, dan penanda tahap selesai bekerja tanpa menghilangkan progres. Melihat tahap berikutnya tidak otomatis menyelesaikan tahap aktif. |
| FR09 | Campuran warna | Resep teruji menampilkan set cat, swatch target, satuan bagian, dan cara koreksi. Warna tanpa resep teruji mendapat perkiraan campuran (Mixbox + ΔE) dari palet, berlabel "perkiraan, uji sedikit dulu", tanpa rasio yang tampak presisi. AI tidak mengubah angka. |
| FR10 | Foto progres | Foto dibandingkan dengan target tahap checkpoint. Jika kualitas atau penyelarasan tidak memadai, sistem meminta foto ulang dan tidak memberi koreksi geometris yang meyakinkan. |
| FR11 | Feedback | Maksimal dua saran yang dapat ditindaklanjuti, dipilih dari kandidat hasil ukur CV, menyebut lokasi/bagian, sesuai medium serta tahap. Penanda visual hanya muncul jika lokasi dapat dipetakan dengan andal. |
| FR12 | Informasi budaya | Fakta yang ditampilkan sebagai fakta wajib menunjuk source_id dari basis pengetahuan terkurasi; selebihnya berlabel "perkiraan AI". Identitas, fakta, adaptasi, dan interpretasi dibedakan. Ketidaktersediaan informasi dinyatakan. |
| FR13 | Progres dan penghapusan | Reload pada browser yang sama memulihkan sesi aktif. Foto yang telah kedaluwarsa diganti penanda, sementara teks feedback tetap tersedia sampai sesi berakhir. Hapus sesi menghilangkan akses segera dan menjadwalkan pembersihan sesuai kebijakan retensi. |
| FR14 | Penutup latihan | Pengguna mendapat rangkuman langkah dan satu pertanyaan refleksi; hasil tidak disebut sertifikasi kemampuan. |
| FR15 | Status dan kegagalan | Unggah, antrean, pemrosesan, berhasil, kualitas tidak cukup, dan gagal dibedakan. Retry tidak membuat pekerjaan atau biaya ganda. |
| FR16 | Storyline cerita (P1) | Identifikasi kisah mengikuti aturan fakta bersumber vs perkiraan. Storyboard 4–6 panel, narasi ≤40 kata per panel, deskripsi tokoh dikunci. Panel dibuat dengan image generation OpenAI, berlabel "Ilustrasi AI", tidak disajikan sebagai karya asli. Tokoh/adegan dalam daftar terbatas narasumber tidak digenerate. Panel koleksi di-cache dan ditinjau sebelum terbit. |
| FR17 | Layer terang-gelap | Aktif hanya bila `use_shading: true` (mis. karya Raden Saleh). Grayscale dipecah 3–5 tingkat dengan koordinat yang sama dengan lapisan lain; dapat dinyalakan/dimatikan. Karya garis dan bidang datar (Kamasan, wayang) tidak mendapat layer ini. |
| FR18 | Lihat foto asli | Toggle "Foto asli" tersedia di setiap tahap (wajib di tahap detail dan penyelesaian) dan bisa zoom ke area yang sedang dikerjakan. |

## 8. Desain materi dan tutorial

Dua jenis materi memakai struktur tahap yang sama:
- **Materi koleksi**: disusun dan ditinjau tim konten/narasumber.
- **Materi mode bebas**: dibuat otomatis dari foto pengguna, divalidasi, dan diberi label "dibuat otomatis".

Unit materi koleksi:
- Satu referensi karya atau adaptasi yang boleh digunakan.
- Satu tujuan keterampilan dan satu tujuan pengetahuan budaya.
- Versi pemula untuk seluruh karya sederhana atau satu potongan.
- 6–8 tahap yang ditinjau.
- Lapisan visual, resep palet, checkpoint (1 pada versi awal, 2 pada showcase), dan refleksi akhir.

Struktur tiap tahap:
1. Judul dan tujuan.
2. Visual target pada tahap itu.
3. Area yang sedang dikerjakan.
4. Instruksi tindakan pendek.
5. Alat, warna, serta resep yang relevan.
6. Teknik atau arah pengerjaan bila diperlukan.
7. Kesalahan umum dan cara memperbaiki.
8. Patokan untuk lanjut.
9. Sumber/penjelasan budaya jika terkait.

Pipeline pembuatan tahapan:
```
Foto → validasi, hapus EXIF, normalisasi 1600 px
→ CV: mask objek utama (rembg), garis (model lineart; cadangan XDoG/Canny),
      region (k-means LAB + gabung region kecil), layer terang-gelap (bila use_shading)
→ stage_planner (kode): bagi region per tahap
→ AI (OpenAI): tulis instruksi, kesalahan umum, patokan selesai, konteks budaya per tahap
→ validator → simpan LessonVersion → frontend render SVG
```

Aturan default `stage_planner`:

| Tahap | Isi |
| --- | --- |
| 1 | Persiapan + grid sesuai ukuran bidang |
| 2 | Sketsa bentuk besar (garis objek utama + garis region besar) — **checkpoint versi awal** |
| 3 | Region latar dan region terbesar |
| 4 | Region objek utama |
| 5 | Region sedang — checkpoint kedua (showcase) |
| 6 (opsional) | Terang-gelap, hanya bila `use_shading` |
| 7 | Region kecil < 0,3% + detail garis asli |
| 8 | Penyelesaian + toggle foto asli |

Pembagian oleh kode lebih stabil (tidak gagal validasi), lebih cepat, dan lebih murah. Setelah stabil, AI yang mengatur urutan dapat diuji sebagai peningkatan.

Urutan ini bukan aturan semua tradisi. Karya garis dan bidang datar mengikuti tekniknya; shading volumetrik tidak ditambahkan secara otomatis.

Gambar generatif terpisah untuk setiap tahap tidak dipakai karena bentuk antar tahap harus tetap sama. Render SVG area datar terasa kaku di tahap akhir (tekstur, gradasi, ornamen kecil hilang), sehingga tahap detail menyediakan foto asli + zoom (FR18).

Ukuran bidang dapat diubah secara proporsional melalui grid. Tutorial tidak menjanjikan penyesuaian jumlah cat berdasarkan luas sebelum pengukuran tersebut tersedia.

## 9. Palet dan pencampuran warna

MVP menggunakan satu set cat yang dicatat sampai merek, seri, dan nama warnanya. Pengguna memilih warna dari daftar; pemindaian merek cat belum tersedia.

Tahapan:
- **27 Nov:** resep perkiraan dari Mixbox + ΔE, dilabeli "perkiraan, uji sedikit dulu".
- **Sebelum showcase:** uji fisik 3–5 resep untuk materi demo; foto swatch kering dengan kartu abu-abu; catat merek, seri, tanggal, dan penguji.

Data resep:
- Warna target dan lokasi penggunaannya.
- Cat penyusun dari palet terdaftar.
- Rasio dalam bagian volume dengan alat ukur kecil yang sama.
- Swatch fisik kering yang difoto dengan pencahayaan terkendali.
- Langkah penambahan bertahap dan cara koreksi.
- Tanggal serta penguji.

Aturan:
- RGB/HEX dipakai untuk tampilan, bukan bukti resep pigmen yang tepat.
- Angka resep berasal dari Mixbox + ΔE atau uji fisik; AI hanya menjelaskan dan tidak mengubah angka.
- Jika target tidak bisa didekati dengan palet, jelaskan keterbatasan dan tawarkan warna terdekat atau cat tambahan.
- Campuran dicoba kecil dan diamati setelah kering.
- Foto ponsel biasa tidak dipakai untuk menjanjikan pengukuran warna yang presisi.
- Lisensi Mixbox CC BY-NC: aman untuk lomba, perlu lisensi untuk komersial (lihat §23).

## 10. Feedback progres

Versi awal: **1 checkpoint setelah sketsa**. Showcase: 2 checkpoint (setelah sketsa dan setelah region sedang). Foto progres bersifat opsional.

Alur:
1. Pengguna memastikan seluruh bidang terlihat, pencahayaan merata, dan bayangan tangan tidak menutup gambar.
2. Sistem memeriksa kualitas foto.
3. Pelurusan: **tap 4 sudut sebagai default**; deteksi kuadrilateral otomatis sebagai peningkatan.
4. Penyelarasan halus dengan ECC terhadap garis target.
5. Metrik per region dihitung CV, lalu dipilih kandidat masalah terbesar.
6. AI menulis maksimal dua saran **hanya dari daftar kandidat**.
7. UI menampilkan saran; pengguna bisa melihat panduan lalu melanjutkan.

Cakupan versi awal: posisi relatif, ukuran bentuk besar, dan area yang belum terisi. Penilaian rona halus dan teknik sapuan tidak menjadi janji produk.

Contoh respons:
> Bentuk utama sudah terbaca. Periksa sisi kiri objek yang terlihat lebih lebar dari panduan sebelum mengisi warna.

Tidak ada skor keindahan atau kewajiban menyerupai referensi secara mutlak. Jika tidak yakin, sistem meminta foto ulang atau menyarankan pengguna membuka garis bantu.

## 11. Integritas materi budaya dan penerbitan

Konteks budaya untuk foto bebas disusun AI dari basis pengetahuan terkurasi (entri tradisi, motif, teknik, dan sumbernya). AI boleh menyebut "gaya ini mirip lukisan Kamasan" sebagai perkiraan, tetapi tidak menebak judul, seniman, atau makna spesifik karya. Unggahan pengguna tidak pernah otomatis masuk koleksi terbit.

### 11.1 Sumber materi koleksi

| Kategori | Ketentuan |
| --- | --- |
| **Aman (public domain)** | Karya pelukis yang wafat lebih dari 70 tahun lalu. Contoh: Raden Saleh (wafat 1880); koleksi Rijksmuseum (open data, boleh komersial) dan Smithsonian (CC0) |
| **Perlu hati-hati** | Karya tradisional (Kamasan, wayang, motif batik klasik) termasuk Ekspresi Budaya Tradisional (EBT). Menurut UU 28/2014 Pasal 38 hak ciptanya dipegang negara, tanpa batas waktu (Pasal 60). Untuk edukasi dengan atribusi kemungkinan aman, tetapi **Sheva mengonfirmasi saat inkubasi atau ke panitia** |
| **Koleksi museum di Wikimedia Commons** (mis. Tropenmuseum/Wereldmuseum) | Lisensi berbeda-beda (public domain atau CC BY-SA 3.0). Cek satu per satu dan cantumkan atribusinya |

Usulan komposisi 3–5 materi:
- 1 karya Raden Saleh — latihan terang-gelap (`use_shading: true`).
- 1–2 karya Kamasan dari koleksi berlisensi terbuka — latihan garis dan bidang datar.
- 1 adaptasi motif tradisional yang digambar ulang tim.

### 11.2 Aturan storyline cerita (P1)

- Kisah hanya disebut sebagai fakta jika tercatat di basis pengetahuan dengan sumber; selebihnya "perkiraan AI" atau "tidak diketahui".
- Ilustrasi mengikuti gaya tradisi, bukan gaya seniman hidup tertentu tanpa izin.
- Tokoh suci, upacara, atau simbol dengan ketentuan budaya mengikuti arahan narasumber; ada daftar tokoh/adegan yang tidak digenerate.
- Panel tidak boleh menambahkan detail budaya (pakaian, senjata, atribut) yang bertentangan dengan sumber; panel koleksi ditinjau sebelum terbit.

### 11.3 Penerbitan

Setiap materi koleksi menyimpan judul, seniman jika diketahui, tradisi/daerah jika bersumber, sumber, kredit, lisensi/izin gambar, cakupan adaptasi, peninjau, dan tanggal tinjauan.

Alur konten: draf → ditinjau → terbit → diarsipkan.

Syarat terbit:
- Gambar memiliki dasar penggunaan yang jelas (§11.1).
- Pernyataan asal, makna, dan teknik dapat ditelusuri.
- Panduan serta resep sudah ditinjau sesuai bidangnya.
- Materi membedakan teknik tradisional dan adaptasi akrilik.
- Elemen dengan ketentuan penggunaan budaya mengikuti arahan narasumber.
- Identitas yang tidak diketahui tetap ditulis tidak diketahui.

Satu pertanyaan akhir menguji informasi yang memang diajarkan, bukan meminta pengguna menebak makna visual.

## 12. Layar dan prinsip pengalaman pengguna

| Layar | Isi dan tindakan utama |
| --- | --- |
| Beranda | Janji produk, cakupan koleksi, pilih karya, mode bebas (unggah/foto) |
| Unggah mode bebas | Pratinjau foto, cek kualitas, ambil ulang; (P1) kandidat koleksi bila ada |
| Membuat tutorial | Status (menganalisis, membagi tahap, menulis instruksi), usulan potongan, batal |
| Detail karya | Konteks budaya, sumber, kredit, lisensi, tujuan latihan, mulai |
| Cerita (P1) | Panel cerita bergeser horizontal, narasi singkat, label fakta/perkiraan/"Ilustrasi AI", tautan "lukis tokoh ini", lewati |
| Persiapan | Palet, alat, ukuran, cakupan, kebutuhan minimum |
| Ruang latihan | Visual besar, lapisan (garis, objek, warna, grid, **terang-gelap** bila ada), toggle **Foto asli** + zoom, slider, instruksi, warna, navigasi |
| Campuran warna | Target, resep (perkiraan/teruji), swatch, petunjuk koreksi |
| Checkpoint | Cara mengambil foto, unggah, tap 4 sudut, status, feedback, lanjut |
| Selesai | Rangkuman, refleksi budaya, lanjut latihan lain, hapus sesi |

Prinsip: satu tindakan utama per tahap, teks pendek, area gambar dominan, kontras jelas, dan kontrol yang nyaman disentuh. Petunjuk harus tetap terbaca tanpa hanya mengandalkan warna. Kontrol lapisan memiliki label; navigasi keyboard dan pembaca layar didukung untuk instruksi serta kontrol.

Palet tampilan netral membantu pengguna mengamati referensi. Ornamen budaya digunakan sesuai konteks materi. Bahasa UI menggunakan instruksi pengguna seperti "Lihat bentuk utama" dan "Foto hasilmu".

## 13. Arsitektur dan pembagian peran AI

Komponen:
- Frontend web (Next.js) untuk kamera/unggah, galeri, grid, lapisan, tutorial, dan progres.
- Backend (FastAPI, Python) untuk sesi, otorisasi aset, validasi file, pekerjaan analisis, dan batas penggunaan.
- Katalog versi materi, resep, serta sumber.
- Penyimpanan aset terbit dan penyimpanan privat unggahan.
- Modul pengolahan gambar: normalisasi, lineart, region, terang-gelap, `stage_planner`, penyelarasan; (P1) pencocokan koleksi.
- Layanan AI teks/vision **OpenAI** melalui backend.
- Image generation **OpenAI** melalui backend untuk panel cerita (P1).
- Pekerja latar untuk analisis dan penghapusan berkala.

Pipeline:
1. Validasi isi file, hapus metadata yang tidak diperlukan, dan normalisasi gambar.
2. Materi galeri: muat materi terkurasi. Mode bebas: lanjut ke langkah 3. (P1: cari kandidat koleksi dan minta konfirmasi.)
3. Buat lapisan visual dari foto (lineart, masker, region warna, terang-gelap bila perlu).
4. `stage_planner` (kode) membagi region per tahap; **AI hanya menulis teks** per tahap, saran penjelasan warna, dan konteks budaya dalam skema terstruktur.
5. Validasi keluaran (skema, jumlah tahap cocok, region_id yang disebut ada, source_id sah), lalu simpan sebagai versi materi milik sesi.
6. AI menulis feedback checkpoint dari kandidat hasil ukur CV, dengan validasi yang sama.
7. (P1) Storyline cerita: AI menyusun storyboard terstruktur → validasi → **image generation OpenAI** per panel dengan karya asli sebagai referensi → simpan panel privat (atau terbit untuk koleksi).

Aturan keluaran AI:
- Instruksi di dalam gambar, OCR, nama file, atau metadata diperlakukan sebagai data.
- Klaim budaya bertipe fakta wajib menunjuk source_id; klaim tanpa sumber wajib bertipe "perkiraan".
- Saran campuran menunjuk recipe_id yang kompatibel, atau bertipe "perkiraan" dengan paint_id dari palet; angka tidak diubah AI.
- Tahap tutorial hanya boleh merujuk region_id yang ada pada lapisan visual.
- Feedback memakai stage_id dan paling banyak dua saran dari daftar kandidat.
- Koordinat penanda hanya diterima jika penyelarasan valid.
- Respons di luar skema, di luar sumber, terpotong, atau ditolak model diganti pesan bantuan/templat.
- Kunci layanan tetap di server.

Contoh skema feedback:
```json
{
  "stage_id": "stage_2",
  "image_quality": "usable",
  "alignment": "confirmed",
  "needs_retake": false,
  "suggestions": [
    {
      "region_id": "r07",
      "observation": "Sisi kiri tampak lebih lebar dari panduan.",
      "action": "Periksa garis bantu sebelum mengisi warna."
    }
  ],
  "source_ids": [],
  "recipe_ids": []
}
```

Contoh teks tahap yang ditulis AI (pembagian region sudah ditentukan kode):
```json
{
  "stage_id": "stage_2",
  "title": "Sketsa bentuk besar",
  "action": "Gambar garis luar figur utama mengikuti grid.",
  "tools": ["pensil 2B", "penghapus"],
  "done_when": "Semua bentuk besar terlihat dan proporsinya sesuai grid.",
  "common_mistakes": ["Figur terlalu besar sehingga terpotong di tepi."],
  "region_labels": { "r07": "jubah merah tokoh utama" }
}
```

Contoh klaim budaya:
```json
{ "text": "Penggunaan garis hitam tegas dan bidang warna datar mirip gaya wayang Kamasan.", "type": "perkiraan", "source_ids": [] }
```

Mode AI yang tidak tersedia harus dinyatakan. Contoh respons demo yang disiapkan tidak boleh ditampilkan seolah hasil analisis langsung.

## 14. Model data minimum

| Entitas | Field inti |
| --- | --- |
| Artwork | id, judul, seniman nullable, tradisi/daerah nullable, aset, sumber, lisensi/hak penggunaan, status |
| LessonVersion | id, artwork_id nullable, asal (koleksi/bebas), session_id nullable, versi, medium, level, cakupan, use_shading, tujuan, reviewer nullable, status |
| CultureEntry | id, tradisi/motif/teknik/kisah, ringkasan, source_ids, batasan generate |
| Story (P1) | id, lesson_version_id, kisah, status (fakta/perkiraan/tidak_diketahui), source_ids, deskripsi tokoh |
| StoryPanel (P1) | id, story_id, urutan, narasi, prompt, aset gambar, region_ids tokoh, provider/model, status |
| Stage | id, lesson_version_id, urutan, visual target, instruksi, area, patokan selesai, is_checkpoint |
| VisualLayer | id, lesson_version_id, jenis (grid/lineart/objek/region/terang-gelap/detail), aset/masker, koordinat |
| Palette | id, merek, seri, daftar paint_id |
| ColorRecipe | id, palette_id, target, komponen, rasio, jenis (perkiraan/teruji), swatch, catatan uji |
| Source | id, judul, penerbit/narasumber, URL/catatan, lisensi, tanggal akses |
| PracticeSession | id acak, lesson_version_id, pilihan, tahap, consent, masa berlaku |
| ProgressUpload | id, session_id, stage_id, aset privat, kualitas, masa hapus |
| FeedbackJob | id, session_id, stage_id, status, hasil tervalidasi, error_code |
| ContentReview | id, lesson_version_id, peninjau, jenis tinjauan, keputusan, tanggal |

Sesi mengunci versi materi agar tahapan tidak berubah ketika katalog diperbarui. Penghapusan sumber budaya tidak boleh diam-diam membuat klaim tanpa sumber; materi terkait perlu ditinjau ulang. Rincian tabel ada di `ERD.md`.

## 15. Kontrak API dan status pekerjaan

| Endpoint konseptual | Fungsi |
| --- | --- |
| GET /artworks | Daftar koleksi terbit |
| POST /recognitions | (P1) Unggah referensi dan cari kandidat koleksi |
| POST /lessons/generate | Buat tutorial dari foto mode bebas (pekerjaan latar) |
| POST /lessons/:id/story | (P1) Buat storyline cerita dan panel (pekerjaan latar) |
| GET /stories/:id | (P1) Storyboard dan status tiap panel |
| GET /lessons/:id | Materi versi terbit dan lapisan |
| POST /sessions | Mulai sesi dan simpan pilihan |
| GET /sessions/:id | Pulihkan sesi yang berhak diakses |
| PATCH /sessions/:id/progress | Perbarui tahap dan penanda selesai |
| GET /recipes/:id | Resep sesuai palet |
| POST /sessions/:id/checkpoints | Unggah progres dan buat pekerjaan feedback |
| GET /jobs/:id | Ambil status atau hasil pekerjaan milik sesi |
| DELETE /sessions/:id | Hapus akses sesi dan jadwalkan penghapusan aset |

Siklus pekerjaan:
queued → processing → succeeded, needs_retake, atau failed.

Request pembuatan tutorial, pencocokan, dan feedback memakai idempotency key. Request ulang dengan kunci dan payload sama mengembalikan pekerjaan yang sama; payload berbeda dengan kunci sama ditolak. Hasil gagal memakai kode yang dapat dipetakan ke pesan pengguna, tanpa membocorkan detail internal.

## 16. Kualitas, kinerja, dan batas biaya

Angka berikut adalah target penerimaan awal, belum hasil pengujian.

| Aspek | Target |
| --- | --- |
| Materi awal | 27 Nov: 1 materi. Showcase: 3–5 materi lolos tinjauan; minimal satu diuji penuh |
| Tampilan utama | Terlihat dalam 3 detik pada perangkat/jaringan uji yang dicatat |
| Navigasi tahap yang dimuat | Respons dalam 300 ms |
| Pencocokan koleksi (P1) | P95 sampai 10 detik, dihitung setelah unggah selesai |
| Pembuatan tutorial | Tahapan visual tampil setelah CV + `stage_planner` selesai; P95 seluruh teks sampai 40 detik setelah unggah selesai |
| Feedback | P95 sampai 30 detik setelah unggah selesai |
| Storyline cerita (P1) | Storyboard teks P95 ≤15 detik; pratinjau panel pertama ≤30 detik; seluruh panel dibuat di latar ≤3 menit. Materi koleksi dibuat lebih dulu |
| Batas tunggu analisis | 45 detik (feedback) / 60 detik (pembuatan tutorial); setelah itu status gagal/coba lagi |
| Pembaruan status | Tampil maksimal 1 detik setelah pekerjaan tercatat |
| Unggahan | Maksimum 10 MB; batas piksel terdecode 25 MP |
| Normalisasi | Sisi panjang maksimum 1600 px untuk analisis awal |
| Kontrol sentuh | Target minimum 44 × 44 CSS px |
| Kontras teks utama | Target minimum 4,5:1 |
| Penggunaan AI | Checkpoint per sesi: 1 (versi awal) / 2 (showcase); satu retry per checkpoint |
| Pembatasan penyalahgunaan | Maksimal tiga pembuatan tutorial per sesi (dan tiga pencocokan bila P1 aktif); batas tambahan pada backend |
| Image generation (P1) | Maksimal satu storyline per tutorial dan satu regenerasi per panel; panel koleksi di-cache |
| Batas pengeluaran | **Batas pengeluaran harian di dashboard OpenAI** ditetapkan sebelum uji pengguna |

Ukur P95 dengan setidaknya 20 eksekusi per alur dan laporkan ukuran sampelnya. Waktu unggah dilaporkan terpisah karena dipengaruhi koneksi. Sistem memakai cache hasil identik dan pembatasan request.

Tutorial dasar tetap bisa digunakan ketika layanan AI gagal. Versi awal tidak menjanjikan penggunaan offline penuh.

## 17. Privasi, akses, dan retensi

- Mode tamu memakai sesi acak yang diverifikasi server; ID berurutan tidak menjadi otorisasi.
- Aset progres privat dan hanya dapat diakses pemilik sesi melalui URL sementara.
- Sesi pada browser yang sama berakhir setelah tujuh hari; lintas perangkat belum tersedia.
- Foto unggahan mentah dan turunannya di penyimpanan aplikasi dihapus otomatis paling lambat 24 jam setelah unggah.
- Setelah foto dihapus, progres dan teks feedback dapat tersedia sampai sesi berakhir.
- "Hapus sesi" mencabut akses segera; aset dan data sesi dibersihkan paling lambat 24 jam.
- Pelaksanaan retensi 24 jam dan penghapusan sesi boleh menyusul setelah 27 Nov, tetapi wajib sebelum uji dengan data pengguna nyata di luar tim.
- Katalog latihan terbit dikelola terpisah dari unggahan pengguna.
- Metadata lokasi dihapus; log tidak menyimpan foto, isi prompt, atau token rahasia.
- **Foto pengguna hanya dikirim ke OpenAI.** Menurut dokumentasi OpenAI, data API tidak dipakai melatih model secara bawaan dan log pemantauan penyalahgunaan disimpan hingga 30 hari; verifikasi kebijakan retensi data API OpenAI sebelum demo.
- Jika DeepSeek dipakai di kemudian hari: hanya untuk tugas teks; foto pengguna tidak dikirim ke DeepSeek.
- Sebelum foto dikirim ke penyedia AI, pengguna mendapat penjelasan singkat dan pilihan untuk melanjutkan tutorial tanpa mengirim foto.
- Setiap permintaan ke OpenAI menyertakan `safety_identifier` berupa hash ID sesi (bukan data pribadi).
- (P1) Panel cerita dari foto pengguna mengikuti retensi unggahan; panel koleksi dikelola sebagai aset terbit.
- Unggahan pengguna tidak dipakai tim sebagai dataset pelatihan tanpa persetujuan terpisah.
- MVP tidak membuat galeri publik otomatis atau mencadangkan unggahan pengguna tanpa kebijakan yang jelas.

Uji akses antarsesi dan pekerjaan penghapusan adalah syarat demo dengan data pengguna nyata.

## 18. Metrik produk dan validasi

### 18.1 Diukur sebelum 27 Nov (uji 5–8 orang)

| Metrik | Definisi | Target |
| --- | --- | --- |
| Keberhasilan memulai | Peserta masuk tahap pertama tanpa bantuan fasilitator | ≥80% |
| Waktu mulai | Median dari membuka beranda sampai mulai tahap pertama | ≤3 menit |
| Kejelasan instruksi | Penilaian peserta pada skala 1–5 | Rata-rata ≥4 |
| Feedback berguna | Peserta dapat menyebut dan melakukan langkah berikutnya dari feedback | ≥70% dari peserta yang mendapat feedback valid |
| Pemahaman budaya | Peserta menjelaskan kembali satu fakta yang diajarkan | ≥70% |
| Testimoni | Kutipan peserta yang boleh dipakai di proposal | 2–3 kutipan |

### 18.2 Target pilot setelah 27 Nov

| Metrik | Definisi | Target |
| --- | --- | --- |
| Penyelesaian latihan pendek | Peserta menyelesaikan tugas yang ditetapkan sebelum uji | ≥60% |
| Dukungan sumber | Materi terbit dengan seluruh klaim faktual terlacak | 100% |
| Label budaya | Klaim tanpa sumber berlabel "perkiraan AI" | 100% |
| Kelayakan tutorial mode bebas | Tutorial dinilai pengajar dapat diikuti pemula dan bentuknya konsisten antar tahap | ≥70% dari set foto uji |
| Penolakan di luar koleksi (P1) | Foto negatif tidak diberi identitas karya yang salah | 0 false acceptance pada set demo negatif |
| Konsistensi panel cerita (P1) | Tokoh utama dikenali sama di semua panel oleh peninjau | ≥80% storyline uji |
| Cerita membantu belajar (P1) | Peserta dapat menceritakan ulang kisah dan menunjuk tokoh yang dilukis | ≥70% |

Laporkan pembilang, penyebut, dan kegagalan; hasil pada sampel kecil tidak berarti akurasi universal.

Event minimum: lesson_viewed, practice_started, stage_completed, recipe_opened, original_photo_opened, checkpoint_requested, feedback_shown, lesson_completed, reflection_answered, session_deleted (P1: recognition_confirmed, story_opened). Event menyimpan ID teknis seperlunya, tanpa gambar atau jawaban bebas pribadi.

Pisahkan pengujian demo singkat dari pengujian belajar nyata yang memberi waktu mengerjakan latihan. Jangan menyimpulkan kemampuan melukis meningkat hanya dari keberhasilan menekan tombol selesai.

## 19. Rencana pengujian

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Lineart model vs XDoG/Canny pada 5 foto | Dipilih metode dengan garis paling bersih; yang lain jadi cadangan |
| 2–3 kandidat model OpenAI (besar vs kecil) untuk teks tahapan dan feedback, foto yang sama | Model dipilih berdasarkan kualitas dan biaya; hasil dicatat |
| Foto mode bebas dari berbagai gaya | 6–8 tahap, bentuk konsisten, teknik sesuai gaya (tanpa terang-gelap pada karya datar) |
| Karya `use_shading` (mis. Raden Saleh) | Layer terang-gelap 3–5 tingkat tampil dan sejajar |
| Toggle foto asli + zoom | Tersedia di tiap tahap, zoom ke area aktif |
| Foto benda bukan karya seni atau bidang kosong | Diminta foto ulang atau ditawari galeri |
| Karya sangat rumit | Sistem menyarankan potongan/versi sederhana |
| Kamera ditolak atau format tidak didukung | Ada jalur alternatif/pesan yang jelas |
| File terlalu besar atau file menyamar sebagai gambar | Ditolak sebelum analisis |
| Lapisan dan slider tiap tahap | Posisi objek serta bentuk konsisten |
| Palet didukung/tidak didukung | Hanya resep kompatibel yang ditampilkan |
| Foto progres + tap 4 sudut | Pembanding mengikuti checkpoint aktif |
| Foto miring, buram, atau gelap | Minta perbaikan foto; jangan memberi koreksi pasti |
| Respons AI salah skema, terpotong, atau tanpa sumber | Ditolak dan templat/bantuan cadangan tampil |
| Instruksi berbahaya tertulis pada gambar | Tidak mengubah aturan atau membuka data |
| Klik ulang, retry, dan timeout | Tidak menggandakan pekerjaan; progres tetap ada |
| Reload dan buka kembali sesi | Pilihan serta tahap tersimpan sampai masa berlaku |
| Akses foto/job sesi lain | Ditolak oleh server |
| Hapus sesi dan habis masa retensi | Akses dicabut dan data dibersihkan sesuai kebijakan |
| Penjelasan budaya dan adaptasi | Ditinjau narasumber; atribusi tetap terlihat |
| HP kecil dan navigasi keyboard | Kontrol terbaca, dapat dipakai, tidak menutup gambar |
| (P1) Foto karya dalam koleksi dengan sudut/cahaya bervariasi | Kandidat benar atau sistem menahan keputusan |
| (P1) Storyline pada karya berkisah dikenal | Kisah bersumber, tokoh konsisten, label "Ilustrasi AI" tampil |
| (P1) Storyline pada karya tanpa kisah diketahui | Tidak mengarang kisah sebagai fakta |
| (P1) Tokoh/adegan dalam daftar terbatas | Tidak digenerate; tampil penjelasan |
| (P1) Image generation OpenAI gagal/timeout/`moderation_blocked` | Storyboard teks tampil; latihan tetap jalan |

Tambahkan sedikitnya sepuluh pasangan foto progres/target, mencakup foto layak dan perlu diulang. (P1) Set pengenalan: minimal lima foto bervariasi per materi dan sepuluh foto negatif; foto kalibrasi dan evaluasi dipisahkan.

Uji resep memakai cat fisik yang dicantumkan. Kualitas feedback ditinjau manusia terhadap foto dan tahap; periksa apakah saran benar, dapat dilakukan, serta sesuai teknik.

## 20. Rencana pengerjaan (jadwal BUDAYA GO)

| Tanggal | Xavier (frontend) | Iqbal (backend, CV, AI) | Sheva (konten) |
| --- | --- | --- | --- |
| 21 Nov | Daftar BUDAYA GO, scaffold frontend | Scaffold API, Supabase, unggah foto | Pilih 1 materi koleksi pertama + cek lisensi |
| 22 Nov | Galeri, detail karya, persiapan | Pipeline CV: mask, garis (uji lineart vs XDoG), region | 5–10 entri basis budaya + sumber |
| 23 Nov | StageCanvas SVG, slider, toggle layer | `stage_planner` + panggilan OpenAI teks per tahap + validator | Tulis tahap materi koleksi pertama |
| 24–25 Nov (inkubasi) | Layar unggah mode bebas, status job, kartu budaya | Resep warna Mixbox (perkiraan), mode bebas end-to-end | Ikut kuliah umum, catat masukan, konfirmasi soal EBT |
| 25–26 Nov | Checkpoint UI (1 checkpoint), tap 4 sudut | Pelurusan + metrik + feedback OpenAI | Uji pengguna 5–8 orang bersama tim |
| 26 Nov | Deploy, rekam video demo | Deploy backend, batas biaya harian | Kumpulkan testimoni |
| 26–27 Nov | Submit proposal + bukti produk (seluruh tim) | | |
| 28 Nov–4 Des | Polishing, aksesibilitas | 2 checkpoint, retensi 24 jam, uji akses antar-sesi | Lengkapi 3–5 materi, 15–30 entri basis budaya, uji resep fisik |
| 7–14 Des (kalau lolos) | Storyline cerita UI (P1) | Storyline OpenAI image (P1), ukur P95 | Narasumber tinjau materi + panel, slide deck |
| 17–19 Des | Demo live + cadangan video | Monitoring | Presentasi budaya |

Pembagian backend antara Xavier dan Iqbal disepakati per modul (misalnya Xavier memegang endpoint sesi dan progres; Iqbal memegang CV, AI, dan warna).

Ketergantungan utama: aset yang boleh digunakan, konfirmasi EBT, peninjau seni/budaya, cat fisik untuk pengujian, akses OpenAI (termasuk verifikasi organisasi bila diwajibkan), perangkat kamera, dan jaringan demo.

Jika waktu menipis, tunda P1 dan kurangi variasi latihan. Pertahankan satu alur nyata yang lengkap. Jika jumlah materi harus turun di bawah tiga atau feedback belum bekerja, dokumentasikan pengurangan scope sebelum presentasi.

## 21. Skenario demo

Target durasi presentasi fitur: sekitar tiga menit, menyesuaikan aturan lomba.

Urutan demo showcase:
1. Buka materi koleksi + konteks budaya bersumber.
2. Geser tahapan dari sketsa sampai detail (termasuk toggle foto asli dan, untuk karya bervolume, layer terang-gelap).
3. Buka resep warna.
4. Unggah foto lukisan baru di mode bebas dan tunjukkan tahapan dibuat otomatis.
5. Unggah foto progres dari lukisan fisik dan tunjukkan feedback.
6. Refleksi budaya.

Storyline cerita masuk demo hanya bila F15 sudah jadi.

Siapkan hasil latihan fisik pada beberapa tahap untuk memperlihatkan hubungan panduan dengan praktik. Foto contoh boleh disiapkan; nyatakan bahwa fotonya contoh progres. **Siapkan video demo cadangan** bila internet atau API bermasalah di lokasi. Bila layanan analisis gagal saat live, jelaskan status dan gunakan tutorial tersimpan; contoh feedback diberi label sebagai contoh.

## 22. Risiko, mitigasi, dan pengembangan

| Risiko | Mitigasi |
| --- | --- |
| Dev hanya 2 orang | P0 dibagi dua gelombang (27 Nov dan showcase); F15 dan pencocokan otomatis jadi P1 |
| Produk belum tersedia per 31 Maret 2026 sesuai juknis | Tulis status jujur di proposal; tanyakan ke panitia (info@budayago.id) |
| Garis sketsa berisik dari tekstur kanvas | Model lineart sebagai utama; XDoG/Canny cadangan; uji di 5 foto |
| Tutorial mode bebas tidak layak diikuti | Lapisan dari foto (bukan generatif), pembagian tahap oleh kode, saran potongan, uji pengajar, materi koleksi sebagai cadangan |
| Model OpenAI terlalu mahal | Model kecil untuk tugas ringan, cache, batas harian, DeepSeek untuk teks tanpa foto sebagai opsi terakhir |
| Hak cipta/EBT materi koleksi | Prioritaskan public domain; konfirmasi EBT ke panitia; atribusi lengkap |
| (P1) Panel cerita tidak konsisten atau keliru secara budaya | Karya asli sebagai referensi, deskripsi tokoh dikunci, tinjauan panel koleksi, daftar terbatas narasumber, fallback storyboard teks |
| (P1) Karya salah dikenali | Batasi koleksi, kalibrasi ambang, konfirmasi pengguna, uji foto negatif |
| AI mengarang fakta budaya | Basis pengetahuan bersumber, label "perkiraan AI", larangan menebak judul/seniman |
| Tahap visual berubah bentuk | Satu referensi/koordinat, lapisan konsisten, tinjauan manual |
| Resep warna tidak cocok | Label perkiraan; satu palet uji; swatch kering untuk materi demo |
| Feedback salah akibat foto | Pemeriksaan kualitas, tap 4 sudut, ECC, batasi cakupan saran |
| Informasi budaya keliru | Sumber per klaim, peninjau, alur terbit versi |
| Internet/API bermasalah saat demo | Video demo cadangan, materi koleksi tersimpan |
| Minat awal tidak berlanjut | Uji kebutuhan nyata dan penyelesaian latihan sebelum ekspansi |

Tahap berikutnya setelah validasi:
- Bantuan kontekstual, level menengah, dan lebih banyak materi yang ditinjau.
- Tutorial untuk medium lain, dievaluasi bersama pengajar.
- Perluasan basis pengetahuan budaya bersama narasumber.
- Kemitraan sanggar/museum, kelas seniman, lalu eksplorasi AR dan medium lain.

Hipotesis keberlanjutan: modul latihan bersama seniman, lisensi penggunaan untuk pengajar/sanggar, atau paket kelas museum. Permintaan, pembagian manfaat, dan harga perlu diuji; pembayaran belum menjadi kebutuhan MVP.

## 23. Keputusan terbuka dan Definition of Done

Sudah diputuskan: nama (Rerupa), tim, penyedia AI (OpenAI).

Keputusan yang masih terbuka:
- Model OpenAI spesifik per tugas (setelah uji 2–3 kandidat).
- Materi final 3–5 karya dan status EBT.
- Narasumber budaya.
- Set cat demo, alat ukur resep, dan hasil uji fisik.
- Subtema final BUDAYA GO.
- Lisensi Mixbox (CC BY-NC): aman untuk lomba; perlu lisensi berbayar atau pengganti (mis. spectral.js, MIT) untuk komersial.
- Frontend tetap Next.js atau React + Vite (backend sudah terpisah; diputuskan bersama).

### Versi 27 Nov — siap jika:
- 1 materi koleksi + mode bebas berjalan di HP.
- 1 checkpoint feedback berjalan.
- Resep perkiraan berlabel tampil.
- Uji 5–8 pengguna selesai, hasil dan testimoni tercatat.
- Video demo terekam.

### Versi showcase — siap jika:
- Semua P0 memiliki alur yang bekerja dan acceptance criteria terpenuhi.
- Ada 3–5 materi terbit dengan sumber/lisensi dan tinjauan yang terdokumentasi.
- Resep palet demo sudah diuji fisik.
- 2 checkpoint berjalan; feedback aktual lolos tinjauan pada cakupan yang dijanjikan.
- Uji akses antar-sesi dan penghapusan 24 jam lolos.
- Laporan ukur (P95, kualitas tutorial mode bebas) dicatat terpisah dari target.
- Jalur gagal, kamera ditolak, dan layanan AI tidak tersedia telah dicoba.
- (P1, bila jadi) Storyline cerita untuk minimal satu materi koleksi dengan panel yang sudah ditinjau dan fallback teks teruji.
- Demo dapat diselesaikan dan batas kemampuan produk dapat dijelaskan.

## 24. Referensi awal

Referensi berikut memberi konteks pembanding dan materi; tidak membuktikan bahwa kombinasi produk ini belum pernah dibuat.

- [Smartify](https://smartify.org/partners/products/web-and-mobile-apps) — pengenalan objek/karya untuk membuka konten kuratorial.
- [Sketchar](https://sketchar.io/blog/learn-to-draw-with-ar-step-by-step-drawing-using-augmented-reality-sketchar-school) — contoh pembelajaran menggambar bertahap dengan AR.
- [ARMA Museum](https://artsandculture.google.com/story/balinese-traditional-classic-paintings-kamasan-style-arma-museum/GQVxVYIPE39iLg?hl=en) — konteks seni lukis Kamasan.
- [GOLDEN](https://justpaint.org/golden-and-williamsburg-virtual-paint-mixer/) — pendekatan simulator campuran berbasis pengukuran cat fisik.
- UU No. 28 Tahun 2014 tentang Hak Cipta, Pasal 38 dan 60 — status Ekspresi Budaya Tradisional.

Materi final tetap membutuhkan verifikasi khusus terhadap karya, teknik, dan izin yang dipilih.
