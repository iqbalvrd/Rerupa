# Riset: tutorial melukis yang bisa diikuti pemula

Per 23 Nov 2026. Bahan diskusi Xavier + Iqbal untuk merombak tutorial (`api/cv/stage_planner.py` + ruang latihan `web/`). Belum ada keputusan; bagian 4 dan 5 adalah usulan.

Mode riset: ringkas (quick brief), bukan tinjauan sistematis. Sumber dicari lewat web search, dibaca dari abstrak atau halaman resmi; DrawMyPhoto dibaca teks lengkapnya. Disusun dengan bantuan AI (Claude); setiap klaim diberi sumber, dan yang tidak ada buktinya ditandai **[CELAH BUKTI]**.

---

## 1. Masalah sekarang (dicoba langsung, "Sawah Berundak")

- Tahap 2 langsung "Sketsa bentuk besar": gunung, batas pohon, dan semua lengkung sawah sekaligus, di grid 6×4.
- Tahap 3 langsung 18 bidang warna, tiap bidang resep 3 cat (18 campuran dalam satu tahap).
- Satu tahap ≈ 30–60 menit kerja. Terlalu banyak hal baru sekaligus untuk pemula.

## 2. Temuan riset (yang relevan saja)

### A. Pecah jadi langkah kecil, satu hal baru per langkah

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| Materi yang dipecah jadi segmen menaikkan retensi dan transfer (efek kecil–sedang) dan menurunkan beban kognitif; 56 studi, 88 perbandingan | Rey dkk. 2019, meta-analisis | Kuat |
| Beban kognitif ditentukan berapa banyak elemen yang harus dipegang bersamaan; materi yang sama berat untuk pemula, ringan untuk ahli | Sweller, van Merriënboer & Paas 2019 | Kuat (teori + review) |
| Jumlah langkah yang "ideal" untuk tutorial melukis | Tidak ditemukan | **[CELAH BUKTI]**: angka per langkah di bawah adalah heuristik, harus diuji |

Artinya: tahap 3 sekarang (18 bidang) melanggar ini paling parah.

### B. Urutan menggambar: kerangka dulu, baru kontur, baru nilai, baru detail

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| DrawMyPhoto memecah foto jadi 5 langkah: garis → bayangan terang → sedang → gelap → detail, plus grid 3×3. Pemula (n=20, antar-kelompok) menghasilkan gambar yang dinilai ahli **lebih baik di semua kategori** (akurasi, bayangan, detail; p < 0,01) dibanding grid saja | Williford dkk. 2019 | Sedang (n kecil, 1 gambar, stylus digital) |
| Peserta paling sering bilang yang mereka pelajari adalah **urutan** mengerjakan gambar. Kelompok grid saja: "Even with a grid drawing is hard" | Williford dkk. 2019 | Sedang (kualitatif) |
| Garis bantu *block-in* (bentuk kasar) sebelum region dan detail membantu gambar lebih akurat | Iarussi, Bousseau & Tsandilas 2013 (dari abstrak) | Sedang |
| How2Sketch: tutorial dibangun dari kerangka bentuk geometri sederhana, diurutkan supaya tiap langkah mudah diikuti; pengguna merasa gambarnya lebih akurat | Hennessey dkk. 2017 | Sedang |
| Kesalahan menggambar terutama dari **salah melihat** (persepsi/perhatian), bukan cuma tangan | Chamberlain & Wagemans 2016; Ostrofsky dkk. 2015 | Kuat (review) |

Artinya: Sketsa butuh lebih banyak langkah (patokan → bentuk kasar → kontur), dan alat yang membantu *melihat* (zoom per kotak, titik patokan, bandingkan dengan acuan) lebih penting dari sekadar instruksi teks.

### C. Bantuan boleh banyak di awal, lalu dikurangi

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| Di DrawMyPhoto pemula tetap takut dengan grid, jadi ditambah **underlay jiplak** (biru tipis) yang bisa dimatikan saat lebih percaya diri | Williford dkk. 2019 | Sedang |
| Bantuan "minta kalau perlu" (on-request) menghasilkan **47% lebih banyak tugas transfer** selesai dibanding bantuan yang selalu tampil | Harms, Kerr & Kelleher 2011 | Sedang |
| Contoh yang dikerjakan (worked example) lalu langkahnya dikurangi bertahap (*fading*) memperlancar peralihan ke mengerjakan sendiri; makin mahir, bantuan makin tidak perlu (*expertise reversal*) | Renkl, Atkinson dkk. | Kuat |

Artinya: mode jiplak/transfer boleh ada untuk pemula, tapi sebagai pilihan yang diminta, bukan default.

### D. Animasi vs gambar diam

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| Animasi/video lebih baik dari gambar diam, efek kecil–sedang (d = 0,37) | Höffler & Leutner 2007, meta-analisis | Kuat |
| Pembaruan dengan studi sampai 2013: efek lebih kecil (g = 0,226) | Berney & Bétrancourt 2016 | Kuat |

Artinya: animasi garis tergambar layak, tapi efeknya sedang. Gabungkan dengan segmentasi: animasi pendek per langkah yang bisa diputar ulang.

### E. Feedback: tepat waktu, jangan terus-menerus

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| Feedback yang selalu tampil diabaikan; lebih baik muncul saat perlu. Peserta bilang nilainya menurun dan terasa "nagging" | Williford dkk. 2019 | Sedang |
| Bukti soal frekuensi feedback untuk skill motorik kompleks campur aduk; feedback pada elemen kunci membantu tanpa membanjiri | Wulf dkk. 2010 dan review yang mengutip Wulf & Shea 2004 | Sedang, tidak konsisten |
| iCanDraw: feedback korektif real-time untuk menggambar wajah | Dixon, Prasad & Hammond 2010 | Hasil studi tidak terverifikasi |

Artinya: checkpoint foto di titik kunci (setelah sketsa, setelah warna dasar) sudah benar arahnya. Jangan tambah feedback di setiap langkah.

### F. AI sebagai tutor per tahap

| Temuan | Sumber | Kekuatan |
| --- | --- | --- |
| SakugaFlow: tutor LLM untuk pemula di 4 tahap (sketsa kasar → garis → warna → finishing), bisa revisi langkah | Kawamura & Rekimoto 2025 (workshop CHI, preprint) | Lemah (preprint) |

Mendukung usulan Iqbal (Sketsa / Warna / Finishing). Aturan PRD tetap: AI tidak menggambar tahapan dan tidak mengarang angka.

### G. Mencampur warna

Tidak ditemukan studi terkontrol tentang cara mengajarkan campuran cat ke pemula; yang ada materi praktisi (blog, kursus, rencana pelajaran museum) yang menyarankan palet terbatas dan latihan langsung. **[CELAH BUKTI]**. Usulan di bagian 4 (maks 6 campuran, uji di kertas dulu) adalah heuristik, harus diuji ke pengguna.

## 3. Prinsip desain (ringkas)

1. **Satu langkah = satu aksi**, target 3–8 menit. Maks ±5 bidang baru per langkah (heuristik, diuji).
2. **Urutan tetap**: patokan → bentuk kasar → kontur → warna dasar (belakang ke depan) → terang-gelap → detail.
3. **Bantu melihat, bukan cuma memberi tahu**: zoom ke kotak grid, titik patokan, overlay acuan.
4. **Bantuan bisa diminta, lalu dikurangi**: mode jiplak opsional; tahap akhir instruksinya makin singkat.
5. **Feedback di titik kunci saja**: 2–3 checkpoint, bukan tiap langkah.

## 4. Usulan struktur baru (±16 langkah, 3 fase)

**Fase 1: Sketsa (7 langkah)**

| # | Langkah | Layer / bantuan |
| --- | --- | --- |
| 1 | Siapkan alat + bidang | Daftar alat |
| 2 | Grid tipis di bidang | Grid, ukuran kotak dalam cm |
| 3 | Titik patokan: 3–5 titik kunci (puncak, ujung objek, cakrawala) | Titik bernomor + kotak grid-nya |
| 4 | Bentuk kasar objek utama (kotak, lingkaran, segitiga) | Garis block-in, sangat sederhana |
| 5 | Garis besar latar (cakrawala, batas bidang besar) | Garis tingkat 1 |
| 6 | Perhalus kontur, satu area grid per kali | Garis tingkat 2, zoom per kotak |
| 7 | Cek sketsa → **checkpoint foto 1** | Overlay acuan |

Opsi "Mode jiplak" (diminta, bukan default): cetak garis seukuran bidang → transfer dengan kertas karbon/grafit. Padanan fisik dari underlay DrawMyPhoto.

**Fase 2: Warna (6 langkah, tergantung jumlah campuran)**

| # | Langkah | Isi |
| --- | --- | --- |
| 8 | Siapkan campuran 1: campur, uji di kertas | 1 resep + swatch |
| 9–12 | Warnai semua bidang campuran 1, lalu campuran 2, dst. (belakang ke depan, besar ke kecil) | Maks 6 campuran total; satu campuran per langkah |
| 13 | Terang-gelap: 3 tingkat (terang, sedang, gelap) | Layer value, mengikuti 3 langkah bayangan DrawMyPhoto |
| | → **checkpoint foto 2** setelah warna dasar | |

**Fase 3: Finishing (3 langkah)**

| # | Langkah | Isi |
| --- | --- | --- |
| 14 | Bidang kecil + detail | Garis detail |
| 15 | Aksen: highlight dan bagian tergelap | Layer value |
| 16 | Bandingkan dengan foto asli, rapikan | Foto asli + overlay |

## 5. Pembagian tugas (usulan)

**Iqbal (backend), ±1–1,5 hari**
1. `stage_planner.py`: 3 fase + langkah kecil sesuai bagian 4; maks ±5 region baru per langkah.
2. CV: garis 3 tingkat (block-in, tingkat 1, tingkat 2) + titik patokan per kotak grid.
3. Warna: kelompokkan region ke maks 6 campuran; satu langkah = satu campuran.
4. Prompt AI: instruksi pendek, posisi lewat kotak grid ("mulai dari kotak A2").
5. `API.md` + contoh JSON baru (`phase`, sub-langkah, tingkat garis, patokan).

**Xavier (frontend), ±1 hari**
1. Header 3 fase + progres langkah.
2. Animasi garis tergambar per langkah (bisa diulang, hormati `prefers-reduced-motion`).
3. Zoom ke kotak grid aktif + titik patokan.
4. Kartu satu campuran per langkah.
5. Mock dev untuk bentuk data baru supaya bisa jalan paralel.

**Disepakati dulu**
1. Contoh JSON baru (Iqbal tulis dulu).
2. Target total langkah (usulan 14–18).
3. Masuk sebelum atau sesudah 27 Nov.
4. Mode jiplak: perlu fitur cetak PDF seukuran bidang atau tidak.

## 6. Keterbatasan

- Studi HCI yang ditemukan memakai stylus/tablet digital, n kecil (±20), satu sesi, tanpa uji transfer. Tidak ada studi melukis akrilik fisik dengan pemula.
- Hasil Iarussi 2013, iCanDraw, dan How2Sketch hanya dibaca dari abstrak/halaman resmi.
- Angka langkah, menit, dan "maks 5 region / 6 campuran" adalah heuristik. Cara paling cepat memvalidasi: uji 3–5 orang dengan satu materi, catat di langkah mana mereka berhenti atau bingung.

## Referensi

- Berney, S., & Bétrancourt, M. (2016). Does animation enhance learning? A meta-analysis. *Computers & Education*, 101, 150–167. https://doi.org/10.1016/j.compedu.2016.06.005
- Chamberlain, R., & Wagemans, J. (2016). The genesis of errors in drawing. *Neuroscience & Biobehavioral Reviews*, 65, 195–207. https://research.gold.ac.uk/id/eprint/20010
- Dixon, D., Prasad, M., & Hammond, T. (2010). iCanDraw: Using sketch recognition and corrective feedback to assist a user in drawing human faces. *Proc. CHI 2010*, 897–906. https://doi.org/10.1145/1753326.1753459
- Harms, K. J., Kerr, J. H., & Kelleher, C. (2011). Improving learning transfer from stencils-based tutorials. *Proc. IDC 2011*. https://researchr.org/publication/HarmsKK11
- Hennessey, J. W., dkk. (2017). How2Sketch: Generating easy-to-follow tutorials for sketching 3D objects. *Proc. I3D 2017*. https://geometry.cs.ucl.ac.uk/projects/2017/how2sketch
- Höffler, T. N., & Leutner, D. (2007). Instructional animation versus static pictures: A meta-analysis. *Learning and Instruction*, 17(6), 722–738. https://doi.org/10.1016/j.learninstruc.2007.09.013
- Iarussi, E., Bousseau, A., & Tsandilas, T. (2013). The drawing assistant: Automated drawing guidance and feedback from photographs. *Proc. UIST 2013*, 183–192. https://hal.archives-ouvertes.fr/hal-00840853
- Kawamura, K., & Rekimoto, J. (2025). SakugaFlow (preprint, GenAICHI workshop, CHI 2025). https://arxiv.org/abs/2506.08443
- Ostrofsky, J., Kozbelt, A., & Cohen, D. J. (2015; terbit online Nov 2014). Observational drawing biases are predicted by biases in perception: Empirical support of the misperception hypothesis of drawing accuracy with respect to two angle illusions. *Quarterly Journal of Experimental Psychology*. https://doi.org/10.1080/17470218.2014.973889
- Atkinson, R. K., Renkl, A., & Merrill, M. M. (2003). Combining fading with prompting fosters learning (judul sesuai hasil pencarian; detail jurnal belum diverifikasi). Bahan fading dan expertise reversal yang dibaca: https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Exp_Rev_LI06.pdf
- Rey, G. D., Beege, M., Nebel, S., Wirzberger, M., Schmitt, T. H., & Schneider, S. (2019). A meta-analysis of the segmenting effect. *Educational Psychology Review*, 31, 389–419. https://doi.org/10.1007/s10648-018-9456-4
- Sweller, J., van Merriënboer, J. J. G., & Paas, F. (2019). Cognitive architecture and instructional design: 20 years later. *Educational Psychology Review*, 31(2), 261–292. https://doi.org/10.1007/s10648-019-09465-5
- Williford, B., Pahud, M., Hinckley, K., Doke, A., & Hammond, T. (2019). DrawMyPhoto: Assisting novices in drawing from photographs. *Proc. Creativity and Cognition 2019*. https://www.microsoft.com/en-us/research/?p=613377
- Wulf, G., Chiviacowsky, S., Schiller, E., & Ávila, L. T. G. (2010). Frequent external-focus feedback enhances motor learning. *Frontiers in Psychology*, 1, 190. https://doi.org/10.3389/fpsyg.2010.00190
