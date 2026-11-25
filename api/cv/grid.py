"""Grid bantu dan nama kotaknya.

Nama kotak: kolom huruf A… dari kiri, baris angka 1… dari atas ("B3" = kolom 2, baris 3).
Dipakai lapisan grid, titik patokan, `grid_cells` langkah/region, dan teks instruksi, supaya
semuanya menyebut kotak yang sama. Teks AI hanya boleh menyebut nama dari sini (API.md).
"""

import string


def grid_dims(width: int, height: int, cells_short_side: int = 4) -> tuple[int, int]:
    """(kolom, baris): kotak hampir persegi, sisi pendek dibagi `cells_short_side`."""
    cell = min(width, height) / cells_short_side
    return max(1, round(width / cell)), max(1, round(height / cell))


def col_name(c: int) -> str:
    letters = string.ascii_uppercase
    return letters[c] if c < 26 else letters[c // 26 - 1] + letters[c % 26]


def cell_name(x: float, y: float, width: int, height: int) -> str:
    cols, rows = grid_dims(width, height)
    c = min(cols - 1, max(0, int(x / width * cols)))
    r = min(rows - 1, max(0, int(y / height * rows)))
    return f"{col_name(c)}{r + 1}"


def cells_for_bbox(bbox: list[int] | tuple[int, ...], width: int, height: int) -> list[str]:
    """Semua kotak yang disentuh bbox [x0, y0, x1, y1], urut baris lalu kolom."""
    cols, rows = grid_dims(width, height)
    x0, y0, x1, y1 = bbox
    out = []
    for r in range(rows):
        for c in range(cols):
            cx0, cy0 = c * width / cols, r * height / rows
            if cx0 < x1 and cx0 + width / cols > x0 and cy0 < y1 and cy0 + height / rows > y0:
                out.append(f"{col_name(c)}{r + 1}")
    return out


def all_cells(width: int, height: int) -> set[str]:
    cols, rows = grid_dims(width, height)
    return {f"{col_name(c)}{r + 1}" for r in range(rows) for c in range(cols)}
