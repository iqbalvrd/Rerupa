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

PART_SUFFIX = {1: " (bagian 1)", 2: " (bagian 2)", 3: " (bagian 3)", 4: " (bagian 4)"}


def stage_text_for(stage: PlannedStage) -> StageText:
    t = TEMPLATES[stage.kind]
    return StageText(
        stage_code=stage.code,
        title=t["title"] + PART_SUFFIX.get(stage.part, ""),
        action=t["action"],
        tools=list(t["tools"]),
        done_when=t["done_when"],
        common_mistakes=list(t["common_mistakes"]),
    )


def template_lesson_text(stages: list[PlannedStage], use_shading: bool) -> LessonText:
    return LessonText(
        style=StyleAnalysis(
            technique="bervolume" if use_shading else "garis_bidang_datar",
            use_shading=use_shading,
            reason="Ditentukan dari analisis gambar (tanpa AI).",
        ),
        skill_goal="Melukis ulang karya secara bertahap dari bentuk besar ke detail.",
        culture_goal="",
        stages=[stage_text_for(s) for s in stages],
        region_labels=[],
        culture_claims=[],
        reflection=None,
    )
