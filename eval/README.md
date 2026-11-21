# Evaluasi CV

Folder ini untuk menguji pipeline CV pada foto lukisan nyata (Fase 2). Foto dan hasil **tidak** di-commit (`photos/*` dan `out/` ada di `.gitignore`), karena bisa berisi karya berhak cipta atau foto pribadi.

## Foto uji yang dibutuhkan (`eval/photos/`)

Minimal 5 foto JPG/PNG/WebP:

| # | Isi | Menguji |
| --- | --- | --- |
| 1 | Karya Raden Saleh (domain publik) | Layer terang-gelap, garis pada lukisan bergradasi |
| 2 | Lukisan gaya Kamasan / wayang | Garis tegas, bidang datar, lukisan ramai (mask) |
| 3 | Lukisan di kanvas bertekstur (difoto dengan HP) | Garis tidak boleh menangkap tekstur kanvas |
| 4 | Foto lukisan yang miring | Normalisasi dan region tetap masuk akal |
| 5 | Foto lukisan agak gelap | Cek kualitas foto |

## Menjalankan

Dari folder `api/`:

```bash
uv run --group cv python ../eval/run_cv.py           # bandingkan semua metode + model
uv run --group cv python ../eval/run_cv.py --quick   # tanpa model (xdog, canny)
```

Hasil:
- `out/summary.md` — tabel perbandingan garis (waktu, kepadatan, segmen/MP), mask (waktu, cakupan), region, `shading_hint`, kualitas, RAM puncak.
- `out/<foto>/sheet.png` — lembar perbandingan visual semua metode.
- `out/<foto>/report.json` — angka lengkap per foto.

## Cara membaca

- **Garis:** pilih metode dengan garis kontur jelas tetapi **segmen/MP rendah** (sedikit bintik tekstur). Simpan pilihan di `LINEART_METHOD`.
- **Mask:** `tidak andal` berarti lukisan tidak punya satu objek utama yang jelas — pipeline otomatis memakai cadangan (region terbesar non-latar).
- **Region:** target ≤35 untuk pemula; bentuk besar harus utuh, tidak pecah jadi bintik.
- **shading_hint:** ≥0,5 → karya bervolume (layer terang-gelap aktif); karya datar seharusnya rendah.
- **RAM puncak:** menentukan ukuran server (rencana: ≥4 GB).

## Checkpoint foto progres (Fase 5)

`run_checkpoint.py` menguji pelurusan + metrik + kandidat pada foto progres **nyata** (sketsa pensil di kertas/kanvas, difoto HP). Format `eval/checkpoint/cases.json` ada di docstring skrip. Siapkan minimal 3–5 foto:

| # | Isi | Harapan |
| --- | --- | --- |
| 1 | Sketsa sesuai panduan, grid terlihat | `ok` |
| 2 | Sketsa dengan objek utama sengaja digeser / dilebarkan | `suggestion` |
| 3 | Foto buram atau gelap | `retake` (`photo_unusable`) |
| 4 | Tap sudut jauh meleset | `retake` (`alignment_failed`) |
| 5 | Kertas kosong (hanya grid) | `retake` (`sketch_not_visible`) |

```bash
uv run --group cv python ../eval/run_checkpoint.py
```

Hasil di `checkpoint/out/` (tidak di-commit): `summary.md` + `<foto>_overlay.jpg` (garis panduan merah, kotak kandidat). Kalibrasi awal memakai foto sintetis (`api/tests/checkpoint_synth.py`); ambang di `cv/compare.py` dan `cv/checkpoint.py` disesuaikan lagi setelah uji foto nyata.

## Ukur P95 dan laporan AI (Fase 7)

- `api/scripts/measure_p95.py`: ≥20 putaran tutorial + feedback lewat API berjalan → tabel P95 vs target PRD. Hasil lokal: [P95_LOKAL.md](P95_LOKAL.md).
- `api/scripts/report_ai.py`: tingkat lolos validator, penolakan, dan biaya per tutorial/feedback dari `ai_usage` + `jobs`.
