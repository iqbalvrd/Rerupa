"""Model pretrained (tanpa training), dimuat sekali per proses lalu dipakai ulang.

Bobot diunduh otomatis saat pertama dipakai dan disimpan di cache:
- rembg: ~/.u2net/
- controlnet_aux (Hugging Face): ~/.cache/huggingface/
"""

import threading
from functools import lru_cache

_lock = threading.Lock()

MASK_MODELS = ("isnet-general-use", "u2net")


@lru_cache(maxsize=2)
def rembg_session(model: str = "isnet-general-use"):
    if model not in MASK_MODELS:
        raise ValueError(f"model mask tidak dikenal: {model}")
    import onnxruntime as ort
    from rembg import new_session

    # Tanpa arena memori: onnxruntime tidak menahan ratusan MB setelah inferensi (worker 1 GB).
    opts = ort.SessionOptions()
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    opts.intra_op_num_threads = 2
    with _lock:
        return new_session(model, sess_opts=opts)


@lru_cache(maxsize=1)
def lineart_detector():
    """Informative Drawings (MIT) lewat controlnet_aux."""
    from controlnet_aux import LineartDetector

    with _lock:
        return LineartDetector.from_pretrained("lllyasviel/Annotators")


def warm_up(lineart_method: str, mask_model: str | None) -> dict[str, int]:
    """Muat model dan jalankan satu inferensi kecil saat worker start, supaya job pertama
    pengguna tidak menunggu unduhan/pemuatan model (uji Fase 3: job pertama 114 s, 82 s di antaranya TEED)."""
    import time

    import numpy as np

    from cv.lineart import edge_map
    from cv.mask import main_object_mask

    dummy = np.full((256, 256, 3), 200, np.uint8)
    dummy[64:192, 64:192] = (120, 60, 40)
    timings = {}
    start = time.perf_counter()
    edge_map(dummy, lineart_method)
    timings["lineart"] = int((time.perf_counter() - start) * 1000)
    if mask_model:
        start = time.perf_counter()
        main_object_mask(dummy, mask_model)
        timings["mask"] = int((time.perf_counter() - start) * 1000)
    return timings


@lru_cache(maxsize=1)
def teed_detector():
    """TEED: detektor tepi sangat kecil."""
    from controlnet_aux import TEEDdetector

    with _lock:
        return TEEDdetector.from_pretrained("fal-ai/teed", filename="5_model.pth")
