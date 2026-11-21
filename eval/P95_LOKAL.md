# Ukur P95 — 2026-11-21 17:49

Server: `http://127.0.0.1:8766` · putaran: 20 · foto uji sintetis · tanpa AI (teks templat).
Waktu = dari permintaan dikirim sampai polling melihat status final (termasuk antre).

| Alur | Sampel berhasil | Median | P95 | Maks | Min | Target PRD | Lolos |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pembuatan tutorial (mode bebas) | 20/20 | 13.9 s | 29.0 s | 49.5 s | 11.9 s | 60 s | ✅ |
| Feedback checkpoint | 20/20 | 12.2 s | 15.0 s | 18.0 s | 9.9 s | 30 s | ✅ |

Gagal: tidak ada

## Catatan

- Mesin: laptop pengembang (Windows, CPU, tanpa GPU), API + worker lokal, database & Storage Supabase Tokyo. Model sama dengan produksi: garis **TEED**, mask **u2net**, 2 checkpoint.
- Ini **baseline lokal**, bukan angka produksi. Ulangi dengan `scripts/measure_p95.py` setelah deploy Railway (Singapura) dan laporkan keduanya.
- Pencilan tutorial 49,5 s (putaran 19) dan 29,0 s: kemungkinan beban CPU laptop / jaringan saat itu; tetap di bawah batas 60 s. Bila di produksi P95 mendekati 60 s, opsi: worker CPU lebih besar, atau `LINEART_METHOD=xdog` (lebih cepat, garis lebih kasar).
- Tanpa AI (key OpenAI belum ada): waktu AI teks (tutorial) dan feedback belum termasuk. Setelah model dipilih, ukur ulang; batas AI dimulai bila masih ≥20 s tersisa dari 45 s (feedback).
