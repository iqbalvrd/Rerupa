# Hasil uji storyline (Fase 8, P1)

Tanggal: 21 Nov 2026 · model teks `gpt-6.1-terra`, gambar `gpt-image-2.6-flare` (draf, kualitas medium)

## 1. Pencocokan foto → koleksi (A)

Lihat [HASIL_PENGENALAN.md](HASIL_PENGENALAN.md): **18/18 tepat**. Skor benar terendah 344, skor salah tertinggi 8, ambang 25. Foto utuh, area latihan saja, dan foto buram dikenali; gambar bukan koleksi tidak pernah cocok.

## 2. Uji nyata dengan API sungguhan

| Skenario | Dasar kisah | Waktu | Biaya | Panel |
| --- | --- | --- | --- | --- |
| Materi koleksi *Penangkapan Pangeran Diponegoro* (`scripts/generate_story.py`) | `curated` — 4 klaim kurasi | 36 s | ±$0,06 | 3 potongan karya asli + 1 ilustrasi AI (lolos pemeriksa) |
| Foto unggahan *Perburuan Singa* (Raden Saleh) + isian judul/seniman, sebelum perbaikan validasi sumber | `user_hint` (semua klaim turun jadi perkiraan) | 104 s | $0,31 | 4 ilustrasi + 1 potongan, semua lolos pemeriksa |
| Sama, setelah perbaikan | `sourced` — 5 fakta bersumber (Google Arts & Culture / museum Riga, Wikimedia) + 1 perkiraan | ±105 s | $0,37 | 3 ilustrasi + 1 potongan; 1 panel jadi kartu teks setelah gagal pemeriksa 2× |

Catatan dari uji:
- **Bug ditemukan & diperbaiki:** dengan structured output, model tidak mengembalikan anotasi kutipan URL, sehingga semua klaim fakta turun menjadi perkiraan. Validator sekarang memakai daftar URL yang benar-benar ditemukan tool pencarian (`include=["web_search_call.action.sources"]`) dan mencocokkan URL tanpa query/fragmen.
- Narasi mengikuti klaim: fakta disebut lugas, perkiraan memakai "mungkin/diperkirakan".
- Pemeriksa panel bekerja: satu panel ditolak 2× (komposisi tidak sesuai adegan) lalu jatuh ke kartu teks sesuai aturan.
- Untuk adegan "versi Pieneman" (lukisan lain), AI memilih komposisi simbolis tanpa tokoh daripada meniru lukisan lain.
- Probe awal menunjukkan model gambar bisa menambah atribut yang tidak ada di karya (keris pada Diponegoro) → pemeriksa konsistensi wajib, dan prompt panel melarang menambah senjata/atribut.

## 3. Biaya & batas

| Komponen | Biaya tipikal |
| --- | --- |
| Pencarian sumber (±3 web search + token) | ±$0,04–0,05 |
| Storyboard | ±$0,007 |
| Panel ilustrasi (`flare`, medium, 1024²) | ±$0,05 per panel |
| Pemeriksa panel | ±$0,001 per panel |
| **Storyline foto unggahan (4–5 panel)** | **±$0,30–0,37** |
| Storyline koleksi (banyak potongan asli) | ±$0,06–0,25, dibuat sekali lalu dipakai semua pengguna |

Batas: 1 storyline per tutorial, maks 4 job cerita per tutorial (termasuk langkah konfirmasi), 3 pencarian web, 1 regenerasi per panel; semua ikut `DAILY_AI_BUDGET_USD`. Dengan $5/hari ≈ 13–15 storyline foto unggahan per hari, jadi fitur ini sebaiknya diaktifkan untuk demo/uji, bukan untuk semua pengguna sekaligus.
