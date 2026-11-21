# Checkpoint pada tutorial nyata (foto progres sintetis)

Skrip: [`run_checkpoint_shift.py`](run_checkpoint_shift.py). Sketsa digambar ulang dari `sketch.svg` tutorial nyata (4 materi koleksi, potongan satu figur), digeser, lalu difoto miring dengan derau. Harapan: tanpa perubahan → tidak ada saran; geser seluruh sketsa → saran pertama "seluruh sketsa bergeser" dengan arah benar.

| Versi | Sesuai harapan |
| --- | --- |
| Sebelum (hanya penilaian per bentuk) | 4/20 — semua pergeseran gagal; beberapa jadi saran "lebih lebar/sempit" yang menyesatkan |
| Sesudah (pergeseran global + kompensasi) | **20/20**, tanpa saran tambahan palsu |

Cara kerja pergeseran global (`cv/compare.py`): cari (dx, dy) yang paling menempelkan garis target ke goresan (jarak chamfer, kasar 1% lalu halus 2 px, sampai ±12%). Diterima bila pergeseran ≥2,5% lebar/tinggi, skor jarak turun ≥30%, ≥75% garis tertutup, dan ≤15% garis yang tadinya pas menjadi meleset (bila hanya satu bentuk yang bergeser, syarat terakhir menolaknya → dinilai per bentuk). Setelah itu bentuk per bidang dinilai ulang dengan pergeseran dikompensasi; bagian tanpa data (keluar tepi) diabaikan.

## Hasil (sesudah)

| Materi | Kasus | Hasil | Kandidat (urut) |
| --- | --- | --- | --- |
| raden-saleh-penangkapan-diponegoro | sesuai | ✅ | – |
| raden-saleh-penangkapan-diponegoro | geser kanan 4% | ✅ | sketch:shifted(kanan) |
| raden-saleh-penangkapan-diponegoro | geser kanan 8% | ✅ | sketch:shifted(kanan) |
| raden-saleh-penangkapan-diponegoro | geser bawah 6% | ✅ | sketch:shifted(bawah) |
| raden-saleh-penangkapan-diponegoro | geser kiri-atas 5% | ✅ | sketch:shifted(kiri atas) |
| lukisan-kain-bali-goteborg | sesuai | ✅ | – |
| lukisan-kain-bali-goteborg | geser kanan 4% | ✅ | sketch:shifted(kanan) |
| lukisan-kain-bali-goteborg | geser kanan 8% | ✅ | sketch:shifted(kanan) |
| lukisan-kain-bali-goteborg | geser bawah 6% | ✅ | sketch:shifted(bawah) |
| lukisan-kain-bali-goteborg | geser kiri-atas 5% | ✅ | sketch:shifted(kiri atas) |
| batik-sarung-buketan-cooper-hewitt | sesuai | ✅ | – |
| batik-sarung-buketan-cooper-hewitt | geser kanan 4% | ✅ | sketch:shifted(kanan) |
| batik-sarung-buketan-cooper-hewitt | geser kanan 8% | ✅ | sketch:shifted(kanan) |
| batik-sarung-buketan-cooper-hewitt | geser bawah 6% | ✅ | sketch:shifted(bawah) |
| batik-sarung-buketan-cooper-hewitt | geser kiri-atas 5% | ✅ | sketch:shifted(kiri atas) |
| mas-pirngadie-sawah-berundak | sesuai | ✅ | – |
| mas-pirngadie-sawah-berundak | geser kanan 4% | ✅ | sketch:shifted(kanan) |
| mas-pirngadie-sawah-berundak | geser kanan 8% | ✅ | sketch:shifted(kanan) |
| mas-pirngadie-sawah-berundak | geser bawah 6% | ✅ | sketch:shifted(bawah) |
| mas-pirngadie-sawah-berundak | geser kiri-atas 5% | ✅ | sketch:shifted(kiri atas) |

Sesuai harapan: 20/20
