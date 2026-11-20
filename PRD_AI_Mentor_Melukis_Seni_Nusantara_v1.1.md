# PRD — AI Mentor Melukis Seni Nusantara

Versi: 1.1  
Tanggal: 20 November 2026  
Status: rancangan produk untuk hackathon; belum merupakan hasil implementasi atau validasi pengguna.  
Perubahan dari v1.0: AI kini membuat tahapan visual (storyline) dari foto apa pun, menuntun pengguna melukis ulang foto tersebut, dan menyusun konteks budaya di baliknya. Koleksi terkurasi tetap ada sebagai materi unggulan dan cadangan demo.  
Nama produk: belum ditentukan.  
Bahasa utama: Indonesia.

## 1. Ringkasan produk

Aplikasi membantu pemula mempelajari seni Nusantara dengan mengubah foto karya apa pun menjadi latihan melukis bertahap. Pengguna memotret atau memilih karya; AI menganalisis foto, menyusun storyline visual 6–8 tahap, menuntun cara melukis ulang, dan menjelaskan budaya di baliknya. Pengguna mengunggah progres untuk mendapat arahan berikutnya.

Nilai utama: pembelajaran visual yang menghubungkan keterampilan melukis, alat yang tersedia, dan pengetahuan budaya.

Pernyataan produk:
> Mentor melukis berbasis AI yang membantu pengguna mempelajari seni Nusantara melalui panduan visual, pencampuran warna, dan feedback progres.

Tiga peran AI:
1. **Pembuat storyline visual** — dari foto, AI memecah gambar menjadi garis, objek, dan bidang warna, lalu menyusun 6–8 tahap visual yang semuanya diturunkan dari satu referensi dan koordinat yang sama.
2. **Pemandu melukis ulang** — AI menulis instruksi per tahap (tindakan, alat, warna, patokan selesai, kesalahan umum) dan memberi feedback pada foto progres.
3. **Penjelas budaya** — AI menjelaskan gaya, motif, dan tradisi yang mungkin terkait. Fakta dari sumber terkurasi dibedakan dari dugaan AI.

Panduan hasil AI adalah jalur latihan yang disarankan, bukan rekonstruksi proses asli seniman; proses asli hanya disebut jika terdokumentasi.

## 2. Asumsi perencanaan

| Aspek | Keputusan sementara |
| --- | --- |
| Platform | Web responsif, diutamakan untuk HP; kamera melalui browser atau unggah galeri |
| Pengguna awal | Pemula, terutama pelajar dan mahasiswa |
| Medium | Akrilik pada kertas yang sesuai atau kanvas |
| Sumber latihan | Foto apa pun dari pengguna (dianalisis AI) + 3–5 materi unggulan terkurasi dengan sumber dan izin jelas |
| Bentuk latihan | Seluruh karya sederhana atau potongan yang dipilih pengguna/AI agar layak untuk pemula |
| Panjang tutorial | 6–8 tahap per latihan; mengikuti teknik materi |
| Pilihan tingkat | Pemula; level menengah masuk pengembangan |
| Peralatan | Satu set cat demo yang merek, seri, dan warnanya dicatat |
| Akun | Mode tamu; progres sementara pada browser yang sama |
| Durasi pengerjaan | Contoh rencana 48 jam; disesuaikan dengan aturan hackathon |
| Monetisasi | Belum diimplementasikan |

Asumsi ini adalah dasar kerja, bukan detail yang sudah ditetapkan penyelenggara. Panduan lomba, durasi resmi, dan komposisi tim belum tersedia.

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

Validasi awal: wawancarai 5–8 calon pengguna, amati cara mereka memulai latihan tanpa produk, lalu uji prototipe dengan tugas yang sama atau setara. Sampel ini memberi temuan awal, belum membuktikan dampak populasi.

## 4. Tujuan dan batas produk

Tujuan MVP:
1. Membantu pengguna memulai latihan tanpa perlu mencari tutorial tambahan.
2. Membuat tahap visual otomatis dari foto pengguna yang konsisten dengan referensi.
3. Memberi saran warna: resep teruji bila tersedia, perkiraan campuran berlabel bila tidak.
4. Memberi satu atau dua tindakan perbaikan pada checkpoint progres.
5. Menghubungkan latihan dengan informasi budaya; fakta bersumber dan dugaan AI dibedakan jelas.
6. Menyelesaikan satu alur demo yang bekerja dari awal sampai akhir.

Di luar MVP:
- Tutorial otomatis untuk karya yang sangat rumit, fotorealistik, atau berukuran besar tanpa pemotongan.
- Gambar generatif terpisah untuk setiap tahap.
- Rekonstruksi pasti urutan sapuan atau pigmen asli seniman.
- Pencocokan warna fisik presisi untuk semua merek cat.
- AR yang menempelkan panduan secara langsung pada kanvas.
- Dukungan cat air, minyak, digital painting, dan beragam teknik sekaligus.
- Skor keindahan, penilaian autentisitas, marketplace, pembayaran, serta jejaring sosial.

Untuk gambar di luar koleksi, AI tetap membuat tutorial. Jika gambar terlalu rumit, AI menyarankan potongan yang lebih sederhana. Jika foto tidak layak (buram, bukan karya seni, terlalu gelap), AI meminta foto ulang. UI menjelaskan sebelum unggah bahwa tutorial dibuat otomatis dan bisa tidak sempurna.

## 5. Prioritas fitur

P0 = wajib untuk demo yang utuh. P1 = ditambahkan setelah P0 stabil. P2 = pengembangan berikutnya.

| ID | Fitur | Prioritas |
| --- | --- | --- |
| F01 | Galeri materi dan detail karya | P0 |
| F02 | Foto/unggah, cek kualitas, dan pencocokan dengan koleksi (opsional) | P0 |
| F03 | Pengaturan alat, ukuran bidang, dan cakupan/potongan latihan | P0 |
| F04 | AI: pecahan visual otomatis dari foto (garis, objek, bidang warna) | P0 |
| F05 | AI: storyline 6–8 tahap + instruksi melukis ulang, slider progres | P0 |
| F06 | Palet: resep teruji + perkiraan campuran AI berlabel | P0 |
| F07 | Foto progres pada dua checkpoint dan feedback AI | P0 |
| F08 | AI: konteks budaya (fakta bersumber vs dugaan AI) dan atribusi | P0 |
| F09 | Simpan progres sementara, lanjutkan, dan hapus sesi | P0 |
| F10 | Satu pertanyaan refleksi budaya saat selesai | P0 |
| F11 | Pertanyaan bantuan kontekstual per langkah | P1 |
| F12 | Pilihan durasi dan tingkat menengah | P1 |
| F13 | Pemindaian swatch dan koreksi warna otomatis | P2 |
| F14 | AR, berbagai medium, serta kelas bersama seniman | P2 |

## 6. Alur utama dan kondisi alternatif

Alur utama:
1. Pengguna membuka beranda dan melihat cakupan koleksi.
2. Pengguna memilih galeri atau memotret referensi.
3. Sistem memeriksa kualitas foto dan mencari kecocokan di koleksi. Jika cocok, pengguna mengonfirmasi dan materi terkurasi dipakai. Jika tidak, foto diproses AI.
4. AI menampilkan konteks budaya singkat dan mengusulkan cakupan latihan (seluruh karya atau potongan).
5. Pengguna memilih alat/palet serta ukuran bidang.
6. AI membuat pecahan visual dan storyline tahap; sistem memvalidasi lalu menampilkan persiapan dan tutorial.
7. Pengguna mengikuti tahap, membuka resep warna, dan menandai progres.
8. Pada dua checkpoint, pengguna bisa memotret hasil dan menerima feedback.
9. Pengguna menyelesaikan latihan, membaca rangkuman keterampilan, dan menjawab refleksi budaya.

Kondisi alternatif:
- Kamera ditolak: unggah galeri dan pilihan koleksi tetap tersedia.
- Foto buram, miring, atau memantul: beri petunjuk mengambil ulang.
- Tidak ada kecocokan: AI tetap membuat tutorial; identitas karya/seniman tidak ditebak dan konteks budaya ditandai sebagai dugaan.
- Gambar terlalu rumit: AI menyarankan potongan atau versi sederhana.
- Pembuatan tutorial gagal atau tidak lolos validasi: tawarkan coba lagi atau materi koleksi.
- Beberapa kandidat mirip: tampilkan pilihan dan minta konfirmasi.
- Alat di luar palet: tampilkan kebutuhan minimum; rasio yang belum diuji tidak ditawarkan.
- AI gagal: tutorial yang sudah dibuat dan materi koleksi tetap bisa digunakan; tampilkan kegagalan dan tombol coba lagi.
- Jaringan terputus: tahap yang sudah dimuat tetap dapat dibaca; unggah ditunda dengan status jelas.
- Pengguna melewati checkpoint: latihan tetap dapat dilanjutkan; jangan menganggapnya telah menerima feedback.

## 7. Kebutuhan fungsional dan acceptance criteria

| ID | Kebutuhan | Acceptance criteria |
| --- | --- | --- |
| FR01 | Galeri dan detail | Tersedia 3–5 materi terbit; setiap materi mempunyai thumbnail, cakupan, alat, kredit, dan sumber. |
| FR02 | Kamera dan unggah | JPEG/PNG/WebP sampai 10 MB diterima setelah validasi isi file; file lain ditolak dengan pesan yang membantu. Akses kamera membutuhkan tindakan pengguna. |
| FR03 | Pengenalan koleksi | Kecocokan koleksi memakai ambang yang dikalibrasi pada foto uji dan dikonfirmasi pengguna. Foto tanpa kecocokan diteruskan ke pembuatan tutorial AI. |
| FR04 | Ketidakpastian identitas | Foto di luar koleksi tidak diberi judul, seniman, atau asal pasti hasil tebakan. Dugaan gaya/tradisi diberi label "perkiraan AI". Skor tidak ditampilkan sebagai probabilitas kebenaran. |
| FR04a | Pembuatan storyline AI | Dari satu foto ternormalisasi, AI menghasilkan 6–8 tahap dalam skema terstruktur; semua lapisan diturunkan dari referensi dan koordinat yang sama. Tutorial yang gagal validasi tidak ditampilkan. |
| FR05 | Pengaturan latihan | Pengguna dapat memilih ukuran, cakupan, dan palet dari opsi yang didukung; pilihan tersimpan per sesi. MVP selalu memakai level pemula dan medium akrilik. |
| FR06 | Pecahan visual | Pengguna bisa mengaktifkan garis bantu, objek utama, dan kelompok warna; seluruh lapisan memakai koordinat referensi yang sama. |
| FR07 | Tahap tutorial | Tiap tahap mempunyai visual target, area fokus, tindakan, alat, warna bila relevan, patokan selesai, dan bantuan kesalahan umum. |
| FR08 | Navigasi tutorial | Kembali, lanjut, zoom, slider, dan penanda tahap selesai bekerja tanpa menghilangkan progres. Melihat tahap berikutnya tidak otomatis menyelesaikan tahap aktif. |
| FR09 | Campuran warna | Resep teruji menampilkan set cat, swatch target, satuan bagian, dan cara koreksi. Warna tanpa resep teruji mendapat perkiraan campuran AI dari palet pengguna, berlabel "perkiraan, uji sedikit dulu", tanpa rasio yang tampak presisi. |
| FR10 | Foto progres | Foto dibandingkan dengan target tahap aktif. Jika kualitas atau penyelarasan tidak memadai, sistem meminta foto ulang dan tidak memberi koreksi geometris yang meyakinkan. |
| FR11 | Feedback | Maksimal dua saran yang dapat ditindaklanjuti, menyebut lokasi/bagian, dan sesuai medium serta tahap. Penanda visual hanya muncul jika lokasi dapat dipetakan dengan andal. |
| FR12 | Informasi budaya | AI menyusun penjelasan budaya untuk setiap foto. Fakta yang ditampilkan sebagai fakta wajib menunjuk source_id dari basis pengetahuan terkurasi; selebihnya berlabel "perkiraan AI". Identitas, fakta, adaptasi, dan interpretasi dibedakan. Ketidaktersediaan informasi dinyatakan. |
| FR13 | Progres dan penghapusan | Reload pada browser yang sama memulihkan sesi aktif. Foto yang telah kedaluwarsa diganti penanda, sementara teks feedback tetap tersedia sampai sesi berakhir. Hapus sesi menghilangkan akses segera dan menjadwalkan pembersihan sesuai kebijakan retensi. |
| FR14 | Penutup latihan | Pengguna mendapat rangkuman langkah dan satu pertanyaan refleksi; hasil tidak disebut sertifikasi kemampuan. |
| FR15 | Status dan kegagalan | Unggah, antrean, pemrosesan, berhasil, kualitas tidak cukup, dan gagal dibedakan. Retry tidak membuat pekerjaan atau biaya ganda. |

## 8. Desain materi dan tutorial

Dua jenis materi memakai struktur tahap yang sama:
- **Materi koleksi**: disusun dan ditinjau pengajar/seniman (berlaku daftar di bawah).
- **Materi AI**: dibuat otomatis dari foto pengguna, divalidasi skema, dan diberi label "dibuat AI".

Unit materi koleksi:
- Satu referensi karya atau adaptasi yang boleh digunakan.
- Satu tujuan keterampilan dan satu tujuan pengetahuan budaya.
- Versi pemula untuk seluruh karya sederhana atau satu potongan.
- 6–8 tahap yang ditinjau pengajar/seniman.
- Lapisan visual, resep palet, dua checkpoint, dan refleksi akhir.

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

Urutan contoh untuk latihan akrilik yang sesuai:
persiapan → sketsa bentuk besar → warna dasar → pengembangan bentuk/warna → detail → penyelesaian.

Urutan ini bukan aturan semua tradisi. Materi yang menekankan garis dan bidang datar mengikuti tekniknya; shading volumetrik tidak ditambahkan secara otomatis.

Cara AI membuat storyline visual:
1. Normalisasi foto (luruskan, potong, sisi panjang 1600 px).
2. Pengolahan gambar: deteksi tepi/garis, segmentasi objek utama, dan kuantisasi warna menjadi 6–12 bidang warna.
3. Model vision/bahasa memilih urutan tahap sesuai teknik karya (misalnya karya garis dan bidang datar tidak diberi shading volumetrik), mengelompokkan bidang per tahap, dan menulis instruksi.
4. Setiap visual tahap dirender dari lapisan yang sama (garis → bidang dasar → pengembangan → detail), sehingga bentuk tidak berubah antar tahap.

Gambar generatif terpisah untuk setiap langkah tidak dipakai karena bentuk antar tahap harus tetap sama. AI hanya memilih, mengurutkan, dan menjelaskan lapisan yang diturunkan dari foto.

Ukuran bidang dapat diubah secara proporsional melalui grid. Tutorial tidak menjanjikan penyesuaian jumlah cat berdasarkan luas sebelum pengukuran tersebut tersedia.

## 9. Palet dan pencampuran warna

MVP menggunakan satu set cat yang dicatat sampai merek, seri, dan nama warnanya. Pengguna memilih warna dari daftar; pemindaian merek cat belum tersedia.

Data resep:
- Warna target dan lokasi penggunaannya.
- Cat penyusun dari palet terdaftar.
- Rasio dalam bagian volume dengan alat ukur kecil yang sama.
- Swatch fisik kering yang difoto dengan pencahayaan terkendali.
- Langkah penambahan bertahap dan cara koreksi.
- Tanggal serta peninjau pengujian.

Aturan:
- RGB/HEX dipakai untuk tampilan, bukan bukti resep pigmen yang tepat.
- AI memakai resep terverifikasi bila ada. Untuk warna lain dari foto, AI memberi perkiraan campuran dari palet pengguna (misalnya "kuning oker + sedikit putih") berlabel perkiraan, tanpa rasio yang tampak presisi.
- Jika target tidak bisa didekati dengan palet pengguna, jelaskan keterbatasan dan tawarkan warna terdekat atau cat tambahan.
- Campuran dicoba kecil dan diamati setelah kering.
- Foto ponsel biasa tidak dipakai untuk menjanjikan pengukuran warna yang presisi.
- Pemindaian swatch serta koreksi warna otomatis masuk tahap pengembangan.

## 10. Feedback progres

Dua checkpoint dipilih berdasarkan materi, misalnya setelah sketsa dan setelah warna dasar. Foto progres bersifat opsional.

Alur:
1. Pengguna memastikan seluruh bidang terlihat, pencahayaan merata, dan bayangan tangan tidak menutup gambar.
2. Sistem memeriksa kualitas serta meminta empat sudut bidang jika deteksi otomatis gagal.
3. Foto diluruskan dan disejajarkan dengan panduan.
4. Sistem membandingkan dengan target checkpoint, bukan hasil akhir.
5. Sistem memilih maksimal dua pengamatan yang cukup didukung.
6. UI menampilkan saran; pengguna bisa melihat panduan lalu melanjutkan.

Cakupan MVP: posisi relatif, ukuran bentuk besar, keberadaan bidang yang perlu diisi, dan hubungan terang-gelap yang jelas pada foto layak. Penilaian rona halus dan teknik sapuan tidak menjadi janji produk.

Contoh respons:
> Bentuk utama sudah terbaca. Periksa sisi kiri objek yang terlihat lebih lebar dari panduan sebelum mengisi warna.

Tidak ada skor keindahan atau kewajiban menyerupai referensi secara mutlak. Jika tidak yakin, sistem meminta foto ulang atau menyarankan pengguna membuka garis bantu.

## 11. Integritas materi budaya dan penerbitan

Konteks budaya untuk foto pengguna disusun AI dari basis pengetahuan terkurasi (entri tradisi, motif, teknik, dan sumbernya). AI boleh menyebut "gaya ini mirip lukisan Kamasan" sebagai perkiraan, tetapi tidak menebak judul, seniman, atau makna spesifik karya. Unggahan pengguna tidak pernah otomatis masuk koleksi terbit.

Setiap materi koleksi menyimpan judul, seniman jika diketahui, tradisi/daerah jika bersumber, sumber, kredit, izin gambar, cakupan adaptasi, peninjau, dan tanggal tinjauan.

Alur konten: draf → ditinjau → terbit → diarsipkan.

Syarat terbit:
- Gambar memiliki dasar penggunaan yang jelas.
- Pernyataan asal, makna, dan teknik dapat ditelusuri.
- Panduan serta resep sudah ditinjau sesuai bidangnya.
- Materi membedakan teknik tradisional dan adaptasi akrilik.
- Elemen dengan ketentuan penggunaan budaya mengikuti arahan narasumber.
- Identitas yang tidak diketahui tetap ditulis tidak diketahui.

Seni lukis Kamasan Bali dapat dipertimbangkan sebagai salah satu arah materi, setelah referensi dan peninjau ditetapkan. Pilihan final 3–5 materi belum diputuskan.

Satu pertanyaan akhir menguji informasi yang memang diajarkan, bukan meminta pengguna menebak makna visual.

## 12. Layar dan prinsip pengalaman pengguna

| Layar | Isi dan tindakan utama |
| --- | --- |
| Beranda | Janji produk, cakupan koleksi, pilih karya, foto referensi |
| Pencocokan | Pratinjau foto, cek kualitas, kandidat koleksi bila ada, ambil ulang |
| Membuat tutorial | Status AI (menganalisis, menyusun tahap), usulan potongan, batal |
| Detail karya | Konteks budaya, sumber, kredit, tujuan latihan, mulai |
| Persiapan | Palet, alat, ukuran, cakupan, kebutuhan minimum |
| Ruang latihan | Visual besar, lapisan, slider, instruksi, warna, navigasi |
| Campuran warna | Target, resep yang diuji, swatch, petunjuk koreksi |
| Checkpoint | Cara mengambil foto, unggah, status, feedback, lanjut |
| Selesai | Rangkuman, refleksi budaya, lanjut latihan lain, hapus sesi |

Prinsip: satu tindakan utama per tahap, teks pendek, area gambar dominan, kontras jelas, dan kontrol yang nyaman disentuh. Petunjuk harus tetap terbaca tanpa hanya mengandalkan warna. Kontrol lapisan memiliki label; navigasi keyboard dan pembaca layar didukung untuk instruksi serta kontrol.

Palet tampilan netral membantu pengguna mengamati referensi. Ornamen budaya digunakan sesuai konteks materi. Bahasa UI menggunakan instruksi pengguna seperti “Lihat bentuk utama” dan “Foto hasilmu”.

## 13. Arsitektur dan pembagian peran AI

Komponen:
- Frontend web untuk kamera/unggah, galeri, grid, lapisan, tutorial, dan progres.
- Backend untuk sesi, otorisasi aset, validasi file, pekerjaan analisis, dan batas penggunaan.
- Katalog versi materi, resep, serta sumber.
- Penyimpanan aset terbit dan penyimpanan privat unggahan.
- Modul pengolahan gambar untuk normalisasi, pencocokan, penyelarasan, dan masker.
- Layanan AI vision/bahasa melalui backend.
- Pekerja latar untuk analisis dan penghapusan berkala.

Pipeline:
1. Validasi isi file, hapus metadata yang tidak diperlukan, dan normalisasi gambar.
2. Cari kandidat pada koleksi terbit; jika cocok dan dikonfirmasi, muat materi terkurasi.
3. Jika tidak cocok: buat lapisan visual dari foto (garis, masker, bidang warna).
4. AI menyusun storyline tahap, instruksi, saran warna, dan konteks budaya dalam skema terstruktur.
5. Validasi keluaran (skema, jumlah tahap, region_id ada di lapisan, source_id/recipe_id sah), lalu simpan sebagai versi materi milik sesi.
6. AI memberi feedback pada checkpoint dengan validasi yang sama.

Aturan keluaran AI:
- Instruksi di dalam gambar, OCR, nama file, atau metadata diperlakukan sebagai data.
- Klaim budaya bertipe fakta wajib menunjuk source_id; klaim tanpa sumber wajib bertipe "perkiraan".
- Saran campuran menunjuk recipe_id yang kompatibel, atau bertipe "perkiraan" dengan paint_id dari palet pengguna.
- Tahap tutorial hanya boleh merujuk region_id yang ada pada lapisan visual hasil olahan foto.
- Feedback memakai stage_id dan paling banyak dua saran.
- Koordinat penanda hanya diterima jika penyelarasan valid.
- Respons di luar skema, di luar sumber, atau terlalu tidak pasti ditolak dan diganti pesan bantuan.
- Kunci layanan tetap di server.

Contoh skema feedback:
```json
{
  "stage_id": "stage_sketch",
  "image_quality": "usable",
  "alignment": "confirmed",
  "needs_retake": false,
  "suggestions": [
    {
      "region_id": "main_object",
      "observation": "Sisi kiri tampak lebih lebar dari panduan.",
      "action": "Periksa garis bantu sebelum mengisi warna."
    }
  ],
  "source_ids": [],
  "recipe_ids": []
}
```

Contoh skema tahap hasil AI:
```json
{
  "stage_id": "stage_2",
  "order": 2,
  "title": "Sketsa bentuk besar",
  "region_ids": ["main_object", "background"],
  "action": "Gambar garis luar figur utama mengikuti grid.",
  "tools": ["pensil 2B", "penghapus"],
  "colors": [],
  "done_when": "Semua bentuk besar terlihat dan proporsinya sesuai grid.",
  "common_mistakes": ["Figur terlalu besar sehingga terpotong di tepi."]
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
| Artwork | id, judul, seniman nullable, tradisi/daerah nullable, aset, sumber, hak penggunaan, status |
| LessonVersion | id, artwork_id nullable, asal (koleksi/ai), session_id nullable, versi, medium, level, cakupan, tujuan, reviewer nullable, status |
| CultureEntry | id, tradisi/motif/teknik, ringkasan, source_ids |
| Stage | id, lesson_version_id, urutan, visual target, instruksi, area, patokan selesai |
| VisualLayer | id, lesson_version_id, jenis, aset/masker, koordinat |
| Palette | id, merek, seri, daftar paint_id |
| ColorRecipe | id, palette_id, target, komponen, rasio, swatch, catatan uji |
| Source | id, judul, penerbit/narasumber, URL/catatan, tanggal akses |
| PracticeSession | id acak, lesson_version_id, pilihan, tahap, consent, masa berlaku |
| ProgressUpload | id, session_id, stage_id, aset privat, kualitas, masa hapus |
| FeedbackJob | id, session_id, stage_id, status, hasil tervalidasi, error_code |
| ContentReview | id, lesson_version_id, peninjau, jenis tinjauan, keputusan, tanggal |

Sesi mengunci versi materi agar tahapan tidak berubah ketika katalog diperbarui. Penghapusan sumber budaya tidak boleh diam-diam membuat klaim tanpa sumber; materi terkait perlu ditinjau ulang.

## 15. Kontrak API dan status pekerjaan

| Endpoint konseptual | Fungsi |
| --- | --- |
| GET /artworks | Daftar koleksi terbit |
| POST /recognitions | Unggah referensi dan cari kandidat koleksi |
| POST /lessons/generate | Buat tutorial AI dari foto (pekerjaan latar) |
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

Request pencocokan dan feedback memakai idempotency key. Request ulang dengan kunci dan payload sama mengembalikan pekerjaan yang sama; payload berbeda dengan kunci sama ditolak. Hasil gagal memakai kode yang dapat dipetakan ke pesan pengguna, tanpa membocorkan detail internal.

## 16. Kualitas, kinerja, dan batas biaya

Angka berikut adalah target penerimaan awal, belum hasil pengujian.

| Aspek | Target |
| --- | --- |
| Materi awal | 3–5 materi lolos tinjauan; minimal satu diuji penuh |
| Tampilan utama | Terlihat dalam 3 detik pada perangkat/jaringan uji yang dicatat |
| Navigasi tahap yang dimuat | Respons dalam 300 ms |
| Pencocokan koleksi | P95 sampai 10 detik, dihitung setelah unggah selesai |
| Pembuatan tutorial AI | P95 sampai 40 detik setelah unggah selesai; status per langkah ditampilkan |
| Feedback | P95 sampai 30 detik setelah unggah selesai |
| Batas tunggu analisis | 45 detik (feedback) / 60 detik (pembuatan tutorial); setelah itu beri status gagal/coba lagi |
| Pembaruan status | Tampil maksimal 1 detik setelah pekerjaan tercatat |
| Unggahan | Maksimum 10 MB; batas piksel terdecode 25 MP |
| Normalisasi | Sisi panjang maksimum 1600 px untuk analisis awal |
| Kontrol sentuh | Target minimum 44 × 44 CSS px |
| Kontras teks utama | Target minimum 4,5:1 |
| Penggunaan AI | Maksimal dua checkpoint per sesi dan satu retry per checkpoint |
| Pembatasan penyalahgunaan | Maksimal tiga pencocokan dan tiga pembuatan tutorial AI per sesi; batas tambahan pada backend |

Ukur P95 dengan setidaknya 20 eksekusi per alur dan laporkan ukuran sampelnya. Waktu unggah dilaporkan terpisah karena dipengaruhi koneksi. Sistem memakai cache hasil identik, pembatasan request, dan batas pengeluaran harian yang harus ditetapkan sebelum demo.

Tutorial dasar tetap bisa digunakan ketika layanan AI gagal. Versi awal tidak menjanjikan penggunaan offline penuh.

## 17. Privasi, akses, dan retensi

- Mode tamu memakai sesi acak yang diverifikasi server; ID berurutan tidak menjadi otorisasi.
- Aset progres privat dan hanya dapat diakses pemilik sesi melalui URL sementara.
- Sesi pada browser yang sama berakhir setelah tujuh hari; lintas perangkat belum tersedia.
- Foto unggahan mentah dan turunannya di penyimpanan aplikasi dihapus otomatis paling lambat 24 jam setelah unggah, termasuk foto untuk pencocokan.
- Setelah foto dihapus, progres dan teks feedback dapat tersedia sampai sesi berakhir.
- “Hapus sesi” mencabut akses segera; aset dan data sesi dibersihkan paling lambat 24 jam.
- Katalog latihan terbit dikelola terpisah dari unggahan pengguna.
- Metadata lokasi dihapus; log tidak menyimpan foto, isi prompt, atau token rahasia.
- Sebelum foto dikirim ke penyedia AI, pengguna mendapat penjelasan singkat dan pilihan untuk melanjutkan tutorial tanpa mengirim foto.
- Retensi di penyedia AI harus diverifikasi terhadap konfigurasi/ketentuannya sebelum membuat janji penghapusan menyeluruh.
- Unggahan pengguna tidak dipakai tim sebagai dataset pelatihan tanpa persetujuan terpisah.
- MVP tidak membuat galeri publik otomatis atau mencadangkan unggahan pengguna tanpa kebijakan yang jelas.

Uji akses antarsesi dan pekerjaan penghapusan adalah syarat demo dengan data pengguna nyata.

## 18. Metrik produk dan validasi

Semua nilai adalah target pilot, bukan klaim dampak yang sudah tercapai.

| Metrik | Definisi | Target awal |
| --- | --- | --- |
| Keberhasilan memulai | Peserta masuk tahap pertama tanpa bantuan fasilitator | ≥80% |
| Waktu mulai | Median dari membuka beranda sampai mulai tahap pertama | ≤3 menit |
| Penyelesaian latihan pendek | Peserta menyelesaikan tugas yang ditetapkan sebelum uji | ≥60% |
| Kejelasan instruksi | Penilaian peserta pada skala 1–5 | Rata-rata ≥4 |
| Feedback berguna | Peserta dapat menyebut dan melakukan langkah berikutnya dari feedback | ≥70% dari peserta yang mendapat feedback valid |
| Pemahaman budaya | Peserta menjelaskan kembali satu fakta yang diajarkan | ≥70% |
| Dukungan sumber | Materi terbit dengan seluruh klaim faktual terlacak | 100% |
| Penolakan di luar koleksi | Foto negatif tidak diberi identitas karya yang salah | 0 false acceptance pada set demo negatif |
| Kelayakan tutorial AI | Tutorial AI dinilai pengajar dapat diikuti pemula dan bentuknya konsisten antar tahap | ≥70% dari set foto uji |
| Label budaya | Klaim tanpa sumber berlabel "perkiraan AI" | 100% |

Laporkan pembilang, penyebut, dan kegagalan; penolakan pada sampel kecil tidak berarti akurasi universal.

Event minimum: lesson_viewed, recognition_confirmed, practice_started, stage_completed, recipe_opened, checkpoint_requested, feedback_shown, lesson_completed, reflection_answered, session_deleted. Event menyimpan ID teknis seperlunya, tanpa gambar atau jawaban bebas pribadi.

Pisahkan pengujian demo singkat dari pengujian belajar nyata yang memberi waktu mengerjakan latihan. Jangan menyimpulkan kemampuan melukis meningkat hanya dari keberhasilan menekan tombol selesai.

## 19. Rencana pengujian

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Foto karya dalam koleksi dengan sudut/cahaya bervariasi | Kandidat benar atau sistem menahan keputusan |
| Foto karya lain di luar koleksi | Tutorial AI dibuat; tidak ada judul/seniman tebakan; budaya berlabel perkiraan |
| Foto benda bukan karya seni atau bidang kosong | Diminta foto ulang atau ditawari galeri |
| Karya sangat rumit | AI menyarankan potongan/versi sederhana |
| Tutorial AI pada berbagai gaya | 6–8 tahap, bentuk konsisten, teknik sesuai gaya (tanpa shading otomatis pada karya datar) |
| Kamera ditolak atau format tidak didukung | Ada jalur alternatif/pesan yang jelas |
| File terlalu besar atau file menyamar sebagai gambar | Ditolak sebelum analisis |
| Lapisan dan slider tiap tahap | Posisi objek serta bentuk konsisten |
| Palet didukung/tidak didukung | Hanya resep kompatibel yang ditampilkan |
| Foto progres pada tahap berbeda | Pembanding mengikuti checkpoint aktif |
| Foto miring, buram, atau gelap | Minta perbaikan foto; jangan memberi koreksi pasti |
| Respons AI salah skema atau tanpa sumber | Ditolak dan bantuan cadangan tampil |
| Instruksi berbahaya tertulis pada gambar | Tidak mengubah aturan atau membuka data |
| Klik ulang, retry, dan timeout | Tidak menggandakan pekerjaan; progres tetap ada |
| Reload dan buka kembali sesi | Pilihan serta tahap tersimpan sampai masa berlaku |
| Akses foto/job sesi lain | Ditolak oleh server |
| Hapus sesi dan habis masa retensi | Akses dicabut dan data dibersihkan sesuai kebijakan |
| Penjelasan budaya dan adaptasi | Ditinjau narasumber; atribusi tetap terlihat |
| HP kecil dan navigasi keyboard | Kontrol terbaca, dapat dipakai, tidak menutup gambar |

Set pengenalan awal: minimal lima foto bervariasi per materi dan minimal sepuluh foto negatif. Foto kalibrasi ambang dan foto evaluasi dipisahkan. Tambahkan sedikitnya sepuluh pasangan foto progres/target, mencakup foto layak dan perlu diulang; jumlah ini tetap terbatas.

Uji resep memakai cat fisik yang dicantumkan. Kualitas feedback ditinjau manusia terhadap foto dan tahap; periksa apakah saran benar, dapat dilakukan, serta sesuai teknik.

## 20. Rencana pengerjaan contoh 48 jam

| Waktu relatif | Hasil yang dituju |
| --- | --- |
| Jam 0–4 | Sepakati materi, palet, cakupan, sumber/izin, dan alur demo |
| Jam 4–12 | Selesaikan satu tutorial penuh, aset tahap, resep uji, dan layar utama |
| Jam 12–24 | Pipeline foto → lapisan visual → storyline AI; hubungkan galeri, sesi, navigasi |
| Jam 24–34 | Konteks budaya AI, saran warna, checkpoint, AI feedback, dan validasi keluaran |
| Jam 34–42 | Uji pengguna, privasi, kegagalan, serta perluas sampai 3–5 materi |
| Jam 42–48 | Perbaiki masalah utama, ukur demo, dan siapkan presentasi |

Peran dapat dirangkap: produk/konten budaya, frontend/UX, backend/pengolahan gambar, serta integrasi AI/QA.

Ketergantungan utama: aset yang boleh digunakan, peninjau seni/budaya, cat fisik untuk pengujian, akses layanan AI, perangkat kamera, dan jaringan demo.

Jika waktu menipis, tunda P1 dan kurangi variasi latihan. Pertahankan satu alur nyata yang lengkap. Jika jumlah materi harus turun di bawah tiga atau feedback belum bekerja, dokumentasikan pengurangan scope sebelum presentasi.

## 21. Skenario demo

Target durasi presentasi fitur: sekitar tiga menit, menyesuaikan aturan lomba.

1. Tunjukkan karya dan konteks budaya singkat.
2. Foto sebuah karya Nusantara; tunjukkan AI menyusun storyline tahap dan konteks budayanya (fakta vs perkiraan).
3. Pilih alat dan buka pecahan visual.
4. Geser tahap untuk memperlihatkan proses dari sketsa sampai detail.
5. Buka satu resep campuran dari palet demo.
6. Unggah foto progres yang disiapkan dari latihan fisik.
7. Tunjukkan feedback aktual dan bagian yang perlu diperiksa.
8. Buka rangkuman pembelajaran budaya.

Siapkan hasil latihan fisik pada beberapa tahap untuk memperlihatkan hubungan panduan dengan praktik. Foto contoh boleh disiapkan; nyatakan bahwa fotonya contoh progres. Bila layanan analisis gagal, jelaskan status dan gunakan tutorial tersimpan; contoh feedback diberi label sebagai contoh.

## 22. Risiko, mitigasi, dan pengembangan

| Risiko | Mitigasi |
| --- | --- |
| Karya salah dikenali | Batasi koleksi, kalibrasi ambang, konfirmasi pengguna, uji foto negatif |
| Tutorial AI tidak layak diikuti | Lapisan dari foto (bukan generatif), validasi skema, saran potongan, uji pengajar, materi koleksi sebagai cadangan |
| AI mengarang fakta budaya | Basis pengetahuan bersumber, label "perkiraan AI", larangan menebak judul/seniman |
| Tahap visual berubah bentuk | Satu referensi/koordinat, lapisan konsisten, tinjauan manual |
| Resep warna tidak cocok | Satu palet uji, swatch kering, hindari rasio hasil tebakan |
| Feedback salah akibat foto | Pemeriksaan kualitas, penyelarasan, batasi cakupan saran |
| Informasi budaya keliru | Sumber per klaim, peninjau, alur terbit versi |
| Cakupan melebihi waktu | P0 dahulu, satu alur lengkap, dokumentasikan pengurangan |
| Biaya/layanan AI terganggu | Kuota, cache, batas pengeluaran, tutorial tersimpan |
| Minat awal tidak berlanjut | Uji kebutuhan nyata dan penyelesaian latihan sebelum ekspansi |

Tahap berikutnya setelah validasi:
- Bantuan kontekstual, level menengah, dan lebih banyak materi yang ditinjau.
- Tutorial AI untuk medium lain, dievaluasi bersama pengajar.
- Perluasan basis pengetahuan budaya bersama narasumber.
- Kemitraan sanggar/museum, kelas seniman, lalu eksplorasi AR dan medium lain.

Hipotesis keberlanjutan: modul latihan bersama seniman, lisensi penggunaan untuk pengajar/sanggar, atau paket kelas museum. Permintaan, pembagian manfaat, dan harga perlu diuji; pembayaran belum menjadi kebutuhan MVP.

## 23. Keputusan terbuka dan Definition of Done

Keputusan yang perlu ditutup sebelum implementasi terkait:
- Nama produk, aturan hackathon, durasi, dan anggota tim.
- Materi awal, hak gambar, peninjau, serta isi adaptasi.
- Set cat, alat ukur resep, dan hasil uji fisik.
- Penyedia AI, kebijakan datanya, batas biaya, dan lingkungan deployment.
- Kemampuan feedback yang benar-benar lolos evaluasi.

Dokumen ini cukup untuk memulai desain dan penyusunan backlog sambil menutup keputusan tersebut.

MVP dinyatakan siap jika:
- Semua P0 memiliki alur yang bekerja dan acceptance criteria terpenuhi.
- Ada 3–5 materi terbit dengan sumber/izin dan tinjauan yang terdokumentasi.
- Minimal satu latihan diuji dari kanvas kosong sampai selesai.
- Resep palet demo sudah diuji fisik.
- Pengenalan diuji pada foto positif dan negatif yang dipisahkan dari kalibrasi.
- Feedback aktual lolos tinjauan pada cakupan yang dijanjikan.
- Tutorial AI diuji pada set foto beragam dan memenuhi target kelayakan; klaim budaya tanpa sumber selalu berlabel.
- Tidak ada masalah kritis akses data, penghapusan, atau klaim budaya.
- Jalur gagal, kamera ditolak, dan layanan AI tidak tersedia telah dicoba.
- Target serta hasil pengukuran dicatat terpisah; perubahan scope diungkapkan.
- Demo dapat diselesaikan dan batas kemampuan produk dapat dijelaskan.

## 24. Referensi awal

Referensi berikut memberi konteks pembanding dan materi; tidak membuktikan bahwa kombinasi produk ini belum pernah dibuat.

- [Smartify](https://smartify.org/partners/products/web-and-mobile-apps) — pengenalan objek/karya untuk membuka konten kuratorial.
- [Sketchar](https://sketchar.io/blog/learn-to-draw-with-ar-step-by-step-drawing-using-augmented-reality-sketchar-school) — contoh pembelajaran menggambar bertahap dengan AR.
- [ARMA Museum](https://artsandculture.google.com/story/balinese-traditional-classic-paintings-kamasan-style-arma-museum/GQVxVYIPE39iLg?hl=en) — konteks seni lukis Kamasan.
- [GOLDEN](https://justpaint.org/golden-and-williamsburg-virtual-paint-mixer/) — pendekatan simulator campuran berbasis pengukuran cat fisik.

Referensi ditelaah dalam percakapan pada 20 November 2026. Materi final tetap membutuhkan verifikasi khusus terhadap karya, teknik, dan izin yang dipilih.

