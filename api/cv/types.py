"""Struktur data keluaran pipeline CV. Semua koordinat dalam ruang gambar ternormalisasi (width × height)."""

from dataclasses import asdict, dataclass, field


@dataclass
class Region:
    code: str  # r01, r02, … — urut dari luas terbesar; dirujuk AI dan stage_planner
    hex: str
    lab: list[float]
    area_pct: float
    bbox: list[int]  # [x, y, w, h]
    centroid: list[int]  # [x, y]
    is_main_object: bool
    is_background: bool
    neighbors: list[str]
    value_level: int | None  # 1 = paling gelap; None bila layer terang-gelap tidak dibuat
    path_svg: str  # path SVG (fill-rule evenodd)


@dataclass
class Quality:
    usable: bool
    blur: float  # varians Laplacian; kecil = buram
    brightness: float  # 0–255
    contrast: float  # simpangan baku kecerahan
    glare_pct: float  # % piksel hampir putih
    reasons: list[str] = field(default_factory=list)


@dataclass
class CvResult:
    width: int
    height: int
    lineart_method: str
    mask_model: str | None
    use_shading: bool
    shading_hint: float  # 0–1: seberapa bergradasi karya (bahan keputusan use_shading)
    quality: Quality
    regions: list[Region]
    # Lapisan: SVG (string) atau PNG (bytes) — semuanya ukuran width × height
    lineart_png: bytes  # garis gelap, latar transparan
    regions_svg: str
    sketch_svg: str  # garis bentuk besar: kontur objek utama + batas region besar
    main_object_svg: str | None
    value_svg: str | None
    numbered_png: bytes  # region berwarna + nomor, ≤1024 px, untuk AI
    ai_image_jpeg: bytes  # foto ternormalisasi ≤1024 px untuk AI
    original_jpeg: bytes  # foto ternormalisasi (untuk toggle "Foto asli")
    timings_ms: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> dict:
        """Ringkasan tanpa data biner (untuk log, laporan evaluasi, dan prompt AI)."""
        return {
            "width": self.width,
            "height": self.height,
            "lineart_method": self.lineart_method,
            "mask_model": self.mask_model,
            "use_shading": self.use_shading,
            "shading_hint": round(self.shading_hint, 3),
            "quality": asdict(self.quality),
            "region_count": len(self.regions),
            "regions": [{k: v for k, v in asdict(r).items() if k != "path_svg"} for r in self.regions],
            "timings_ms": self.timings_ms,
            "warnings": self.warnings,
        }
