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
    from rembg import new_session

    with _lock:
        return new_session(model)


@lru_cache(maxsize=1)
def lineart_detector():
    """Informative Drawings (MIT) lewat controlnet_aux."""
    from controlnet_aux import LineartDetector

    with _lock:
        return LineartDetector.from_pretrained("lllyasviel/Annotators")


@lru_cache(maxsize=1)
def teed_detector():
    """TEED: detektor tepi sangat kecil."""
    from controlnet_aux import TEEDdetector

    with _lock:
        return TEEDdetector.from_pretrained("fal-ai/teed", filename="5_model.pth")
