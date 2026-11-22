"""Model pretrained (tanpa training), dimuat sekali per proses lalu dipakai ulang.

Bobot diunduh otomatis saat pertama dipakai dan disimpan di cache:
- rembg: ~/.u2net/ atau ~/.rembg/models/ (U2NET_HOME bila diisi)
- controlnet_aux (Hugging Face): ~/.cache/huggingface/

Worker berjalan di RAM 1 GB, jadi pustaka berat dihindari:
- controlnet_aux: hanya submodul yang dipakai dimuat; __init__ paketnya memuat semua detektor (±150 MB).
- u2net: dijalankan langsung dengan onnxruntime, praproses sama persis dengan rembg (rembg ikut memuat
  pymatting/scipy, ±90 MB). Model mask lain tetap lewat rembg.
"""

import glob
import importlib.util
import os
import sys
import threading
import types
from functools import lru_cache

_lock = threading.Lock()

MASK_MODELS = ("isnet-general-use", "u2net")


def _ort_options():
    import onnxruntime as ort

    # Tanpa arena memori: onnxruntime tidak menahan ratusan MB setelah inferensi.
    opts = ort.SessionOptions()
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    opts.intra_op_num_threads = 2
    return opts


def _u2net_path(name: str) -> str | None:
    homes = [os.getenv("U2NET_HOME"), os.path.join(os.getenv("XDG_DATA_HOME", "~"), ".u2net"), "~/.rembg"]
    for home in filter(None, homes):
        home = os.path.expanduser(home)
        for cand in (os.path.join(home, f"{name}.onnx"), os.path.join(home, "models", name, f"{name}.onnx")):
            if os.path.isfile(cand):
                return cand
        found = glob.glob(os.path.join(home, "**", f"{name}.onnx"), recursive=True)
        if found:
            return found[0]
    return None


class U2netOrt:
    """Sama dengan rembg U2netSession.predict + remove(only_mask=True), tanpa memuat paket rembg."""

    def __init__(self, path: str):
        import onnxruntime as ort

        self.inner = ort.InferenceSession(path, sess_options=_ort_options(), providers=["CPUExecutionProvider"])

    def mask(self, img):
        import numpy as np
        from PIL import Image

        mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
        im = np.array(img.convert("RGB").resize((320, 320), Image.Resampling.LANCZOS))
        im = im / max(np.max(im), 1e-6)
        x = np.zeros((320, 320, 3))
        for c in range(3):
            x[:, :, c] = (im[:, :, c] - mean[c]) / std[c]
        x = np.expand_dims(x.transpose((2, 0, 1)), 0).astype(np.float32)
        pred = self.inner.run(None, {self.inner.get_inputs()[0].name: x})[0][:, 0, :, :]
        pred = np.squeeze((pred - pred.min()) / (pred.max() - pred.min()))
        out = Image.fromarray((pred.clip(0, 1) * 255).astype("uint8"), mode="L")
        return out.resize(img.size, Image.Resampling.LANCZOS)


class _RembgSession:
    def __init__(self, session):
        self.session = session

    def mask(self, img):
        from rembg import remove

        return remove(img, session=self.session, only_mask=True)


@lru_cache(maxsize=2)
def rembg_session(model: str = "isnet-general-use"):
    """Objek dengan .mask(PIL) → PIL 'L'."""
    if model not in MASK_MODELS:
        raise ValueError(f"model mask tidak dikenal: {model}")
    with _lock:
        if model == "u2net" and (path := _u2net_path("u2net")):
            return U2netOrt(path)
        from rembg import new_session

        return _RembgSession(new_session(model, sess_opts=_ort_options()))


def _controlnet_aux_light() -> None:
    """Daftarkan paket controlnet_aux tanpa menjalankan __init__-nya, supaya
    `from controlnet_aux.teed import ...` hanya memuat modul yang dipakai."""
    if "controlnet_aux" in sys.modules:
        return
    spec = importlib.util.find_spec("controlnet_aux")
    if spec is None or not spec.submodule_search_locations:
        return
    pkg = types.ModuleType("controlnet_aux")
    pkg.__path__ = list(spec.submodule_search_locations)
    pkg.__spec__ = spec
    sys.modules["controlnet_aux"] = pkg


@lru_cache(maxsize=1)
def lineart_detector():
    """Informative Drawings (MIT) lewat controlnet_aux."""
    _controlnet_aux_light()
    from controlnet_aux.lineart import LineartDetector

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


TEED_ONNX_DEFAULT = "~/.cache/rerupa/teed.onnx"


@lru_cache(maxsize=1)
def teed_onnx():
    """TEED hasil ekspor ONNX (scripts/export_teed_onnx.py, dijalankan saat build image worker).
    Dengan ini worker tidak memuat torch sama sekali (±300 MB di Linux). None bila file tidak ada
    (mis. lokal) → pemanggil memakai torch."""
    path = os.path.expanduser(os.getenv("TEED_ONNX_PATH", TEED_ONNX_DEFAULT))
    if not os.path.isfile(path):
        return None
    import onnxruntime as ort

    with _lock:
        return ort.InferenceSession(path, sess_options=_ort_options(), providers=["CPUExecutionProvider"])


@lru_cache(maxsize=1)
def teed_detector():
    """TEED: detektor tepi sangat kecil."""
    _controlnet_aux_light()
    from controlnet_aux.teed import TEEDdetector

    with _lock:
        return TEEDdetector.from_pretrained("fal-ai/teed", filename="5_model.pth")
