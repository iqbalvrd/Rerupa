# Konten Rerupa

Folder untuk materi koleksi dan basis pengetahuan budaya (dikelola tim konten).

## Materi koleksi: `artworks/<slug>/`

Setiap materi = satu folder berisi `meta.json` dan file gambar karya.

```json
{
  "slug": "raden-saleh-perburuan-singa",
  "title": "Perburuan Singa (The Lion Hunt)",
  "artist": "Raden Saleh",
  "artist_death_year": 1880,
  "tradition": null,
  "region_origin": null,
  "license": "public_domain",
  "license_note": "Domain publik — Raden Saleh wafat 1880",
  "rights_evidence_url": "https://commons.wikimedia.org/wiki/File:…",
  "adaptation_scope": "Potongan kelompok penunggang dan singa",
  "image": "image.jpg",
  "scope": { "x": 0.25, "y": 0.15, "w": 0.5, "h": 0.7 },
  "canvas_size": "A4",
  "use_shading": true,
  "skill_goal": "…",
  "culture_goal": "…",
  "reviewer": null,
  "sources": [
    { "code": "wm_lion_hunt_1841", "title": "…", "publisher": "Wikimedia Commons", "url": "https://…", "license": "public_domain", "claim_note": "Judul, seniman, tahun, lisensi" }
  ],
  "claims": [
    { "text": "…", "type": "fakta", "source_codes": ["wm_lion_hunt_1841"] }
  ]
}
```

Aturan:
- `license` salah satu: `public_domain`, `cc0`, `cc_by`, `cc_by_sa`, `open_data`, `ebt_pending`, `own_work`, `permission_granted`, `unknown`. Karya `unknown` tidak bisa diterbitkan.
- `artist` diisi `null` bila tidak diketahui — jangan ditebak.
- Klaim `type: "fakta"` wajib menunjuk minimal satu `source_codes` yang ada di `sources`. Dugaan ditulis `type: "perkiraan"` tanpa sumber.
- `scope` opsional: area latihan (satu figur) dalam pecahan 0–1. Lukisan penuh tokoh sebaiknya dipotong.
- `use_shading` opsional: `true` untuk karya bervolume (mis. Raden Saleh), `false` untuk garis dan bidang datar (Kamasan, wayang). Bila kosong, ditentukan otomatis.

Impor (dari folder `api/`):

```bash
uv run --group cv python scripts/import_collection.py ../content/artworks/<slug>             # sebagai draf
uv run --group cv python scripts/import_collection.py ../content/artworks/<slug> --publish   # terbit, setelah ditinjau
```

Impor ulang membuat versi lesson baru; sesi yang sudah berjalan tetap memakai versinya sendiri.
