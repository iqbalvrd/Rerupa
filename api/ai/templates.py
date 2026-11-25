"""Teks cadangan per jenis tahap. Dipakai bila AI tidak dikonfigurasi, pengguna tidak setuju
foto dikirim ke AI, AI gagal, atau keluaran AI tetap tidak lolos validasi setelah retry.

Teks sengaja umum dan aman: tidak menyebut budaya, tokoh, atau makna apa pun."""

from ai.schemas import LessonText, StageText, StyleAnalysis
from cv.stage_planner import PlannedStage

TEMPLATES: dict[str, dict] = {
    "preparation": {
        "title": "Persiapan dan grid",
        "action": "Siapkan cat dan kuas, lalu bagi bidang lukis dengan grid pensil tipis sesuai panduan.",
        "tools": ["pensil 2B", "penggaris", "penghapus"],
        "done_when": "Grid terlihat samar dan garisnya sejajar dengan tepi bidang.",
        "common_mistakes": ["Garis grid terlalu tebal sehingga masih terlihat setelah dicat."],
    },
    "sketch": {
        "title": "Sketsa bentuk besar",
        "action": "Gambar garis luar bentuk-bentuk besar mengikuti grid. Abaikan detail kecil dulu.",
        "tools": ["pensil 2B", "penghapus"],
        "done_when": "Semua bentuk besar sudah terlihat dan proporsinya sesuai grid.",
        "common_mistakes": ["Bentuk terlalu besar sehingga terpotong di tepi bidang."],
    },
    "background_and_largest": {
        "title": "Latar dan bidang terbesar",
        "action": "Isi bidang yang menyala di panduan, mulai dari latar dan bidang terluas.",
        "tools": ["kuas pipih besar"],
        "done_when": "Tidak ada bagian kosong di bidang-bidang yang menyala.",
        "common_mistakes": ["Cat melewati garis sketsa ke bentuk di sebelahnya."],
    },
    "main_object": {
        "title": "Objek utama",
        "action": "Isi bidang objek utama yang menyala di panduan dengan warna dasarnya.",
        "tools": ["kuas pipih sedang", "kuas bulat"],
        "done_when": "Bentuk objek utama terbaca jelas dengan warna dasarnya.",
        "common_mistakes": ["Lapisan cat terlalu tebal di tepi sehingga bentuk melebar."],
    },
    "medium_regions": {
        "title": "Bidang sedang",
        "action": "Isi bidang-bidang sedang yang menyala di panduan satu per satu.",
        "tools": ["kuas bulat sedang"],
        "done_when": "Semua bidang sedang sudah terisi warna dasarnya.",
        "common_mistakes": ["Mengisi bidang sebelum cat di sebelahnya kering sehingga warnanya tercampur."],
    },
    "value": {
        "title": "Terang dan gelap",
        "action": "Nyalakan lapisan terang-gelap, lalu pertegas bagian gelap dan terang sesuai panduan.",
        "tools": ["kuas bulat sedang"],
        "done_when": "Bagian gelap dan terang terbaca dari jarak satu langkah.",
        "common_mistakes": ["Bagian gelap dibuat terlalu hitam sehingga kehilangan warnanya."],
    },
    "small_and_detail": {
        "title": "Bidang kecil dan detail",
        "action": "Isi bidang-bidang kecil dan pertegas garis detail mengikuti panduan.",
        "tools": ["kuas bulat kecil"],
        "done_when": "Bidang kecil terisi dan garis detail utama sudah tampak.",
        "common_mistakes": ["Kuas terlalu basah sehingga garis detail melebar."],
    },
    "finishing": {
        "title": "Penyelesaian",
        "action": "Bandingkan lukisanmu dengan foto asli, lalu rapikan tepi dan bagian yang belum rata.",
        "tools": ["kuas bulat kecil"],
        "done_when": "Lukisan terlihat rapi saat dibandingkan dengan foto asli.",
        "common_mistakes": ["Menambah detail terlalu banyak sampai bentuk besar hilang."],
    },
}

# Tutorial bertahap (structure_version 2). {cell}, {mix}, {n} diisi dari data langkah (bukan AI).
TEMPLATES_V2: dict[str, dict] = {
    "preparation": {
        "title": "Siapkan alat dan bidang",
        "action": "Siapkan pensil, penggaris, penghapus, dan bidang lukis. Letakkan foto karya di dekatmu.",
        "tools": ["pensil 2B", "penggaris", "penghapus"],
        "done_when": "Semua alat ada di meja.",
        "common_mistakes": ["Bidang lukis miring atau bergeser saat digambar; tempel sudutnya dengan selotip."],
    },
    "grid": {
        "title": "Buat grid tipis",
        "action": "Bagi bidang dengan garis pensil sangat tipis sesuai grid. Beri nama kolom (A, B, …) dan baris (1, 2, …) di tepi.",
        "tools": ["pensil 2B", "penggaris"],
        "done_when": "Semua kotak sama besar dan garisnya samar.",
        "common_mistakes": ["Garis grid terlalu tebal sehingga masih terlihat setelah dicat."],
    },
    "landmarks": {
        "title": "Titik patokan",
        "action": "Beri titik kecil di setiap titik patokan. Mulai dari titik 1 di kotak {cell}; lihat posisinya di dalam kotak.",
        "tools": ["pensil 2B"],
        "done_when": "Semua titik ada di kotak yang sama dengan contoh.",
        "common_mistakes": ["Menghitung kotak dari kanan; kolom A selalu di paling kiri."],
    },
    "block_in": {
        "title": "Bentuk kasar objek utama",
        "action": "Hubungkan titik patokan dengan garis panjang yang tipis, mulai dari kotak {cell}. Cukup bentuk besarnya; belum perlu rapi.",
        "tools": ["pensil 2B"],
        "done_when": "Bentuk besar objek utama sudah terlihat dari jauh.",
        "common_mistakes": ["Langsung menggambar wajah atau motif sebelum bentuk besarnya pas."],
    },
    "background_lines": {
        "title": "Garis besar latar",
        "action": "Tambahkan garis panjang batas bidang besar dan latar, mulai dari kotak {cell}.",
        "tools": ["pensil 2B"],
        "done_when": "Batas bidang besar sudah jelas.",
        "common_mistakes": ["Menekan pensil terlalu keras sehingga sulit dihapus."],
    },
    "contour": {
        "title": "Perhalus kontur",
        "action": "Pertegas garis luar satu kotak demi satu kotak, mulai dari kotak {cell}. Garis abu-abu sudah kamu gambar; ikuti garis hitam yang baru.",
        "tools": ["pensil 2B", "penghapus"],
        "done_when": "Kontur lengkap dan garis bentuk kasar yang salah sudah dihapus.",
        "common_mistakes": ["Menggambar rincian kecil sebelum kontur lengkap."],
    },
    "sketch_check": {
        "title": "Cek sketsa",
        "action": "Foto sketsamu lurus dari atas, atau lewati langkah ini bila sketsamu sudah mirip contoh.",
        "tools": [],
        "done_when": "Feedback sketsa sudah dibaca, atau langkah ini dilewati.",
        "common_mistakes": ["Foto miring atau terkena bayangan tangan."],
    },
    "color_prep": {
        "title": "Siapkan palet dan kertas uji",
        "action": "Siapkan cat, air, kain lap, dan selembar kertas uji. Lihat semua campuran yang akan dipakai.",
        "tools": ["palet", "kertas uji", "air", "kain lap"],
        "done_when": "Palet dan kertas uji siap.",
        "common_mistakes": ["Mengeluarkan cat terlalu banyak sekaligus sehingga cepat kering."],
    },
    "paint_mix": {
        "title": "Campuran {n}: {mix}",
        "action": "Buat campuran {n} ({mix}), uji di kertas, lalu warnai bidang yang menyala. Mulai dari kotak {cell}.",
        "tools": ["kuas pipih 12 mm"],
        "done_when": "Semua bidang yang menyala tertutup rata dengan campuran ini.",
        "common_mistakes": ["Mencampur terlalu sedikit sehingga warna berubah di tengah bidang."],
    },
    "value": {
        "title": "Terang dan gelap",
        "action": "Gelapkan bagian yang gelap di panduan, termasuk bagian dalam lipatan; biarkan bagian terang tetap terang.",
        "tools": ["kuas bulat sedang"],
        "done_when": "Bagian gelap dan terang terbaca dari jarak satu langkah.",
        "common_mistakes": ["Menggambar lipatan sebagai garis hitam; buat dengan bidang yang lebih gelap."],
    },
    "small_and_detail": {
        "title": "Bidang kecil dan garis detail",
        "action": "Isi bidang-bidang kecil, lalu goreskan garis detail hitam yang baru dengan kuas kecil.",
        "tools": ["kuas bulat no. 2"],
        "done_when": "Bidang kecil terisi dan garis detail sudah tampak.",
        "common_mistakes": ["Kuas terlalu basah sehingga garis detail melebar."],
    },
    "accents": {
        "title": "Aksen terang dan gelap",
        "action": "Tambahkan sedikit warna paling terang dan paling gelap di bagian yang ditandai.",
        "tools": ["kuas bulat kecil"],
        "done_when": "Bagian paling terang dan paling gelap sudah menonjol.",
        "common_mistakes": ["Menambah aksen di terlalu banyak tempat."],
    },
    "compare": {
        "title": "Bandingkan dan rapikan",
        "action": "Letakkan lukisanmu di samping foto asli, lalu rapikan tepi bidang yang belum rata.",
        "tools": ["kuas bulat kecil"],
        "done_when": "Tidak ada bidang kosong dan tepi bidang sudah rapi.",
        "common_mistakes": ["Menambah detail terlalu banyak sampai bentuk besar hilang."],
    },
}

PART_SUFFIX = {1: " (bagian 1)", 2: " (bagian 2)", 3: " (bagian 3)", 4: " (bagian 4)"}


def stage_text_for(stage: PlannedStage, mixes: dict[str, dict] | None = None, landmark_cells: list[str] | None = None) -> StageText:
    """Teks templat satu tahap. Langkah v2 (punya `phase`) memakai TEMPLATES_V2 dengan kotak grid
    dan nama campuran dari data. `mixes`: {mix_id: {"order_no", "name"}}."""
    if stage.phase is None:
        t = TEMPLATES[stage.kind]
        return StageText(
            stage_code=stage.code,
            title=t["title"] + PART_SUFFIX.get(stage.part, ""),
            action=t["action"],
            tools=list(t["tools"]),
            done_when=t["done_when"],
            common_mistakes=list(t["common_mistakes"]),
        )
    t = TEMPLATES_V2[stage.kind]
    mix = (mixes or {}).get(stage.mix_id or "", {})
    cells = (landmark_cells or stage.grid_cells) if stage.kind == "landmarks" else stage.grid_cells
    fill = {"cell": cells[0] if cells else "kiri atas", "mix": mix.get("name", "warna"), "n": mix.get("order_no", "")}

    def f(text: str) -> str:
        return text.format(**fill).replace("kotak kiri atas", "kiri atas")

    return StageText(
        stage_code=stage.code,
        title=f(t["title"]),
        action=f(t["action"]),
        tools=list(t["tools"]),
        done_when=t["done_when"],
        common_mistakes=list(t["common_mistakes"]),
    )


def template_lesson_text(stages: list[PlannedStage], use_shading: bool, mixes: dict[str, dict] | None = None,
                         landmark_cells: list[str] | None = None) -> LessonText:
    return LessonText(
        style=StyleAnalysis(
            technique="bervolume" if use_shading else "garis_bidang_datar",
            use_shading=use_shading,
            reason="Ditentukan dari analisis gambar (tanpa AI).",
        ),
        skill_goal="Melukis ulang karya secara bertahap dari bentuk besar ke detail.",
        culture_goal="",
        stages=[stage_text_for(s, mixes, landmark_cells) for s in stages],
        region_labels=[],
        culture_claims=[],
        reflection=None,
    )
