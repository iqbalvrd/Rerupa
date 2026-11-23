# LANDING_SPEC.md — Landing 3D Rerupa

Brief untuk Claude Code: membangun landing page 3D Rerupa di `web/` (Next.js), berdasarkan prototipe v3 yang sudah disetujui. Baca juga `CLAUDE.md` di root. Kalau ada yang bertentangan dengan `CLAUDE.md`, ikuti `CLAUDE.md` lalu tanya.

File yang menyertai dokumen ini:

| File | Isi | Taruh di |
| --- | --- | --- |
| `landing_prototype_v3.html` | Prototipe yang sudah disetujui, satu file, Three.js r187 vanilla | `docs/landing/` (referensi, bukan untuk di-deploy) |
| `nature.glb` | 7 model tanaman Quaternius, tekstur WebP 512px, sekitar 1,2 MB | `web/public/models/nature.glb` |
| `QUATERNIUS_LICENSE.txt` | Lisensi aset tanaman (CC0) | `web/public/models/` |

---

## 1. Konteks singkat

- **Produk:** Rerupa, mentor melukis seni Nusantara berbasis AI. Detail produk ada di `PRD_Rerupa_v1.3.md`.
- **Lomba:** BUDAYA GO 2026 (Kementerian Kebudayaan), kategori Inovasi Digital.
- **Peran landing:** pintu masuk ke app, dengan metafora **museum**. User berdiri di halaman depan Museum Nasional (Gedung Gajah), ketuk, kamera berjalan ke pintu, pintu terbuka, cahaya putih, lalu masuk ke **galeri** (dinding dengan bingkai, tempat upload foto karya).
- **Prioritas:** landing **bukan inti produk**. Kerjakan setelah alur inti (galeri, tahapan, checkpoint) aman. Kalau waktu mepet sebelum 27 Nov, pakai versi cadangan statis (bagian 9) dan landing 3D masuk versi showcase.

---

## 2. Arah visual (keputusan tim, jangan diubah tanpa tanya)

**Stylized, bersih, halus. Bukan realistis.**

Yang **ditolak** tim dan tidak boleh dipakai lagi:
- Tekstur foto (PBR dari Poly Haven): plaster, marmer, paving, rumput foto. Hasilnya terlihat kotor dan "kayak game lama".
- Langit dari HDRI foto.
- Pola bata atau kotak-kotak di gedung.
- Bloom global (bikin layar kabur putih).

Yang **dipakai**:
- Permukaan polos dengan warna solid dan sedikit roughness, tepi dibulatkan (`RoundedBoxGeometry`) supaya menangkap cahaya dengan halus.
- Langit gradasi dari shader (ungu → pink → peach) dengan cahaya matahari lembut di belakang kiri gedung.
- Rumput instanced yang bergoyang, warna gradasi.
- Tanaman bergaya Ghibli dari Quaternius.
- Cahaya hangat senja, bayangan lembut.

Referensi suasana: title screen game. Kamera rendah, patung sebagai titik fokus, museum di belakang. Referensi navigasi: Gorillaz Kong Studios (kamera berpindah antar titik yang sudah ditentukan, bukan jalan bebas).

---

## 3. Komposisi dan alur

### 3.1 Title screen (idle)
- Kamera rendah (sekitar 0,8 m dari tanah), sedikit mendongak.
- **Patung gajah perunggu** di atas alas putih, di kanan depan, badan tiga perempat menghadap kanan. Titik fokus pertama.
- **Gedung Gajah** besar di belakang: fasad putih neoklasik, portico tengah 6 tiang dengan atap segitiga, sayap panjang kiri-kanan dengan jendela tinggi, tangga 3 tingkat, pintu kayu dua daun yang glow tipis.
- Jalan batu melengkung dari depan kamera, memutari sisi patung, ke tangga.
- Pohon, semak di depan fasad, bunga di pinggir jalan, rumput bergoyang, burung dan awan bergerak pelan, 2 lampu taman di kiri-kanan tangga.
- Overlay UI:
  - Kiri atas: tagline "Mentor melukis seni Nusantara", judul **Rerupa**, satu kalimat penjelasan.
  - Kanan atas: tombol "Tentang · Tim" (dialog) dan "Lewati".
  - Bawah: "BUDAYA GO 2026 · Inovasi Digital" dan tombol **"Ketuk untuk masuk ›"**.

### 3.2 Masuk
1. Pemicu: tombol "Ketuk untuk masuk" **atau** klik/tap langsung di pintu (raycast ke daun pintu dan glow). Hover di pintu: kursor pointer + glow lebih terang.
2. Input dikunci selama transisi. UI overlay fade out.
3. Kamera bergerak sepanjang kurva selama sekitar 5,5 detik dengan easing in-out.
4. Arah pandang pindah pelan dari target awal (dekat patung) ke pintu, antara 12% dan 62% durasi.
5. Antara 78% dan 93% durasi: dua daun pintu terbuka ke dalam, lampu di depan pintu menyala, glow membesar.
6. Antara 90% dan 100%: layar putih penuh.
7. Fade ke halaman **galeri** (route app, bukan bagian scene 3D).

### 3.3 Lewati dan kembali
- "Lewati": langsung ke galeri dengan fade putih singkat.
- `prefers-reduced-motion`: tidak ada perjalanan kamera dan animasi idle; langsung fade ke galeri.
- Simpan di `localStorage` (dibungkus try/catch) bahwa user sudah pernah lewat landing, lalu tampilkan tombol "Lewati" lebih menonjol untuk kunjungan berikutnya. Jangan auto-skip tanpa user memilih.

---

## 4. Spesifikasi scene (dari prototipe v3)

Satuan meter. Koordinat: x ke kanan, y ke atas, z ke arah kamera. Museum di z negatif.

### 4.1 Renderer
- `toneMapping = ACESFilmic`, `exposure ≈ 0.95`
- Shadow map aktif, `PCFShadowMap` (PCFSoft sudah dihapus di r187)
- Pixel ratio maksimal 1,5
- Environment: `RoomEnvironment` lewat PMREM, `environmentIntensity ≈ 0.35` (hanya untuk pantulan perunggu)
- Fog linear warna cakrawala `#f4c6a0`, near 90, far 260

### 4.2 Langit
Sphere radius 500, `BackSide`, `ShaderMaterial` tanpa fog:
- Gradasi: cakrawala `#f4c6a0` → tengah `#d08aa6` (smoothstep 0–0,22) → atas `#433c78` (0,22–0,75)
- Glow matahari arah `(-0.45, 0.12, -1)`: `pow(s,24)*0.9 + pow(s,4)*0.18`, warna hangat
- Awan: 4 sprite gradasi lembut, opacity 0,55, bergerak pelan ke kanan

### 4.3 Cahaya
- Hemisphere: langit `#ffdcec`, tanah `#6f7f4c`, intensitas 0,9
- Directional (matahari): `#ffd6ac`, intensitas 2,6, posisi `(-28, 34, 30)`, bayangan 2048, kamera bayangan ±70 × ±45

### 4.4 Palet material (MeshStandardMaterial, metalness 0 kecuali disebut)

| Bagian | Warna | Roughness |
| --- | --- | --- |
| Dinding | `#f7f1e6` | 0,85 |
| List, tiang, atap segitiga | `#fffbf3` | 0,7 |
| Alas bangunan | `#e3dbcd` | 0,85 |
| Atap datar | `#d8d1c6` | 0,85 |
| Kaca jendela | `#37445a` | 0,35 |
| Bingkai jendela | `#ece4d6` | 0,7 |
| Pintu | `#5a3a22` | 0,55 |
| Tangga | `#e9e2d6` | 0,9 |
| Perunggu patung | `#7d5631` | 0,32, metalness 0,9 |
| Jalan | tekstur kanvas `#ece2d1` dengan garis sambungan tipis | 0,92 |
| Bingkai jalan | `#d2c6b2` | 0,9 |

### 4.5 Gedung Gajah (`MZ = -40`, muka sayap)
- Alas 104 × 1 × 16, sayap 100 × 10,4 × 12, list atas, atap datar, list tengah di ketinggian sekitar 4
- Jendela tiap 6,2 m (kecuali dekat portico): bingkai, kaca, ambang atas dan bawah, pilaster di antaranya
- Tangga 3 tingkat (36/33/30 lebar)
- Portico: dinding belakang 26 lebar, entablature 29,2 × 1,5 × 9,4, atap segitiga extrude (lebar 30, tinggi 5,4) dengan bidang dalam (tympanum) yang sedikit beda warna
- 6 tiang di x = ±3,6, ±7,3, ±11, z = MZ + 7,4: batang silinder (r 0,62–0,74, tinggi 10,2), kepala dan alas tiang melebar, plint kotak
- Pintu di z = MZ + 1,06: dua daun 2 × 7 dengan engsel di tepi luar, panel timbul, gagang emas; bidang cahaya `#fff4dc` (toneMapped false) di belakangnya; sprite glow additive; PointLight yang menyala saat terbuka
- Lampu taman di x = ±17, z = MZ + 12

### 4.6 Jalan
`CatmullRomCurve3` di tanah: `(1,0,18) → (-2.2,0,2) → (0.8,0,-12) → (0,0,-24) → (0,0,MZ+11)`. Pita lebar 5 m dengan UV mengikuti panjang, plus dua pita bingkai 0,4 m sedikit lebih tinggi.

### 4.7 Patung
- Posisi desktop `(6.5, 0, -6.5)`, portrait `(3.6, 0, -6.5)`
- Alas: base 6,4, badan 5,4 × 2,9, tutup 6,0 (rounded)
- Figur diputar `rotation.y = -0.55` (menghadap kanan)
- **Sekarang placeholder dari bola dan tabung.** Ganti dengan model gajah (lihat bagian 7)

### 4.8 Rumput
- `InstancedMesh` 40.000 helai, tiap helai 5 vertex (tinggi 0,62)
- Area x ±35, z dari 20 ke -28; kosongkan radius 3,3 m dari jalan dan area alas patung
- Skala 0,55–1,05, tinggi 0,5–1,0 dari itu
- `ShaderMaterial`: gradasi pangkal `(0.16,0.30,0.10)` ke ujung per-instance (hijau muda bervariasi), angin `sin` di vertex shader berbobot kuadrat tinggi, fade ke warna fog 40–120 m
- Tanah di bawahnya: plane 600 m dengan tekstur kanvas hijau `#6a9149` berbercak (repeat 40)

### 4.9 Tanaman (Quaternius)
Dari `nature.glb` (7 scene, root dinamai): `CommonTree_1`, `CommonTree_3`, `Bush_Common`, `Bush_Common_Flowers`, `Flower_3_Group`, `Flower_4_Group`, `Grass_Common_Short`.
- Pohon: 11 titik di belakang dan samping halaman (lihat prototipe), skala 1,0–2,3
- Semak: berjajar di depan fasad tiap 4,4 m (kecuali area portico), 35% versi berbunga
- Bunga: 7 titik di pinggir jalan, skala 0,6
- Semak berbunga: 4 di sekitar alas patung
- Material bawaan glTF, `alphaTest 0.4` untuk daun, cast/receive shadow
- Di repo, muat `.glb` langsung dengan `useGLTF` (drei). Trik base64 `.txt` di prototipe **hanya** karena host artifact tidak melayani `.glb`; jangan dibawa ke repo.

### 4.10 Kamera
- Kurva: `(0.6,0.8,13) → (-1.6,1.2,1) → (0.6,1.7,-10) → (0,2.1,-22) → (0,2.7,MZ+14) → (0,3.8,MZ+6.2)`
- Target awal `(2.5, 6.4, -22)` (portrait `(1.2, 6.4, -22)`), target akhir pintu `(0, 4.95, MZ+1.06)`
- FOV: 50 (landscape), 60 (aspect < 1,2), 72 (aspect < 0,8)
- Easing `easeInOutCubic`, durasi 5,5 detik

---

## 5. Implementasi di repo

### 5.1 Stack
- React Three Fiber + `@react-three/drei` di dalam `web/` (Next.js, sesuai `CLAUDE.md`)
- Three.js versi terbaru yang stabil (prototipe memakai r187). Perhatikan perubahan API: `HDRLoader` (bukan RGBELoader), `THREE.Timer` (bukan Clock), `PCFSoftShadowMap` sudah dihapus
- Animasi transisi: `useFrame` + state, atau GSAP. Jangan pakai library fisika

### 5.2 Struktur yang disarankan
```
web/
├─ app/page.tsx                  # landing: <LandingScene/> + <LandingOverlay/>
├─ components/landing/
│  ├─ LandingScene.tsx           # Canvas, renderer settings, fog, lights
│  ├─ Sky.tsx                    # shader langit + awan
│  ├─ Museum.tsx                 # Gedung Gajah dari primitif
│  ├─ Door.tsx                   # daun pintu, glow, lampu, raycast target
│  ├─ Path.tsx                   # jalan + bingkai dari kurva
│  ├─ Statue.tsx                 # alas + model gajah (placeholder dulu)
│  ├─ Grass.tsx                  # instanced grass + shader
│  ├─ Nature.tsx                 # penempatan pohon/semak/bunga dari nature.glb
│  ├─ Birds.tsx
│  ├─ CameraRig.tsx              # kurva kamera, lookAt lerp, state idle/travel/done
│  ├─ LandingOverlay.tsx         # judul, tombol, dialog Tentang, fade putih
│  └─ landingConfig.ts           # SEMUA angka di bagian 4 (posisi, warna, kurva, durasi)
└─ public/models/nature.glb
```
Semua angka tuning (warna, posisi, kurva, durasi) dikumpulkan di `landingConfig.ts`, jangan disebar di komponen.

### 5.3 Port dari prototipe
- `landing_prototype_v3.html` adalah sumber kebenaran visual. Hasil port harus terlihat sama atau lebih baik di sudut kamera awal.
- Pecah kode prototipe ke komponen di 5.2; logika dan angka dipertahankan.
- Setelah port, ambil screenshot sudut awal (desktop 1280×720 dan HP 390×844) dan bandingkan dengan prototipe.

### 5.4 Skill Claude Code
Tim memakai `cloudai-x/threejs-skills` (MIT) di `.claude/skills/`. Pakai skill `threejs-react-three-fiber`, `threejs-performance`, `threejs-materials`, `threejs-lighting`, dan `threejs-loaders` saat mengerjakan modul ini.

---

## 6. Performa dan aksesibilitas

- Target 60 fps di laptop, minimal 30 fps di HP kelas menengah.
- Bayangan hanya dari matahari; batasi objek yang cast shadow kalau berat.
- Rumput: turunkan jumlah instance di HP (misalnya 15–20 ribu) berdasarkan ukuran layar atau `navigator.hardwareConcurrency`.
- Pixel ratio maksimal 1,5; pertimbangkan 1,0 di HP lemah.
- Layar loading dengan progress bar (LoadingManager / `useProgress`); tombol masuk nonaktif sampai aset siap.
- Preload aset galeri selama perjalanan kamera.
- Semua tombol punya label teks, target sentuh minimal 44 px, fokus keyboard terlihat.
- `prefers-reduced-motion` dihormati (bagian 3.3).
- Canvas diberi `aria-label`; semua info penting (judul, info lomba, tim) ada di HTML overlay, bukan hanya di 3D.

---

## 7. Aset dan lisensi

| Aset | Sumber | Lisensi | Status |
| --- | --- | --- | --- |
| Pohon, semak, bunga | Stylized Nature MegaKit oleh Quaternius (versi Standard, Juli 2024) | CC0 | Dipakai, sudah dikompres di `nature.glb` |
| Skill Three.js | `cloudai-x/threejs-skills` | MIT | Dipakai di `.claude/skills/` |
| Tekstur dan HDRI Poly Haven | polyhaven.com | CC0 | **Ditolak tim secara visual**, jangan dipakai |
| Font | Yeseva One, Plus Jakarta Sans (Google Fonts) | OFL | Dipakai |
| Model gajah | belum | — | **Keputusan terbuka**, lihat bawah |

Kandidat model gajah (pilih dan konfirmasi ke tim dulu, jangan pilih sendiri):
- OpenGameArt "low poly elephant model" (syncopika), CC0, format `.blend` (perlu ekspor ke glTF)
- Sketchfab "Low poly elephant" (MrEliptik), CC BY, wajib atribusi
- Model buatan sendiri atau image-to-3D, lalu dirapikan di Blender

Material gajah: perunggu dari tabel 4.4. Pose berdiri, menghadap kanan tiga perempat.

Jangan mengambil aset, kode, atau file dari situs Gorillaz Kong Studios. Itu hanya referensi pola navigasi.

---

## 8. Kriteria selesai

- Sudut kamera awal mirip prototipe v3 di desktop dan HP.
- Klik tombol atau pintu menjalankan perjalanan kamera, pintu terbuka, fade putih, lalu route ke galeri.
- "Lewati", dialog "Tentang · Tim", dan reduced motion berfungsi.
- Tidak ada error di console; tidak ada asset 404.
- fps memenuhi target di bagian 6 pada perangkat uji yang dicatat.
- Total aset landing di bawah sekitar 3 MB (tanpa font).
- Semua angka tuning ada di `landingConfig.ts`.

---

## 9. Cadangan statis (wajib ada)

Kalau WebGL tidak tersedia, perangkat terlalu lemah, atau waktu habis sebelum 27 Nov:
- Satu gambar statis sudut awal (render dari scene) sebagai latar.
- Overlay UI yang sama.
- Tombol masuk: fade putih 0,6 detik ke galeri.

---

## 10. Yang harus ditanyakan dulu, jangan diputuskan sendiri

1. Model gajah yang dipakai.
2. Perubahan arah visual (palet, langit, gaya tanaman).
3. Menambah efek post-processing (bloom, DoF, outline).
4. Menambah area yang bisa dijelajah selain halaman depan.
5. Mengganti Quaternius dengan pack tanaman lain.
