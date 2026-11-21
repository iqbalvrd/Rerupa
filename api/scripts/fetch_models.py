"""Unduh bobot model CV ke cache (dipanggil saat build image worker, SEBELUM kode aplikasi disalin).

Sengaja tidak mengimpor kode aplikasi: lapisan Docker ini hanya dibangun ulang bila daftar dependensi
(pyproject/uv.lock) atau file ini berubah, bukan setiap kali kode berubah (A4, ANALISA_OPTIMASI.md).
Model sama dengan cv/models.py: rembg u2net, TEED (fal-ai/teed), Informative Drawings (lllyasviel/Annotators).
"""

import time

t = time.perf_counter()
from rembg import new_session  # noqa: E402

new_session("u2net")
from controlnet_aux import LineartDetector, TEEDdetector  # noqa: E402

TEEDdetector.from_pretrained("fal-ai/teed", filename="5_model.pth")
LineartDetector.from_pretrained("lllyasviel/Annotators")
print(f"model siap dalam {time.perf_counter() - t:.0f} s")
