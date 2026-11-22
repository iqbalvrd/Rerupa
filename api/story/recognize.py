"""(A) Pencocokan foto unggahan ke materi koleksi (PRD FR03, RENCANA §4.8).

Foto lukisan dari HP biasanya miring, terpotong, dan cahayanya tidak rata. Hash gambar (pHash) gagal
di kondisi ini, jadi dipakai pencocokan fitur lokal: ORB → rasio Lowe → homografi RANSAC. Jumlah
titik yang konsisten secara geometris (inlier) menjadi skor. Hasil hanya KANDIDAT: pengguna harus
mengonfirmasi "Apakah ini …?" sebelum storyline koleksi dipakai.
"""

import logging
import threading
import time
from dataclasses import dataclass

import cv2
import numpy as np

from cv.normalize import decode_rgb, resize_max_side

log = logging.getLogger("rerupa.recognize")

MAX_SIDE = 1000
N_FEATURES = 3000
RATIO = 0.75
MIN_INLIERS = 25  # dikalibrasi (eval/HASIL_PENGENALAN.md): cocok ≥119, bukan-cocok ≤8
MIN_INLIER_RATIO = 0.25
REF_TTL_SECONDS = 600

_orb = cv2.ORB_create(nfeatures=N_FEATURES)
_lock = threading.Lock()


@dataclass
class Reference:
    artwork_id: str
    slug: str
    title: str
    artist: str | None
    keypoints: list
    descriptors: np.ndarray


def features(rgb: np.ndarray):
    gray = cv2.cvtColor(resize_max_side(rgb, MAX_SIDE), cv2.COLOR_RGB2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)  # tahan cahaya tidak rata
    with _lock:  # ORB OpenCV tidak dijamin aman dipakai bersamaan oleh beberapa thread
        return _orb.detectAndCompute(gray, None)


def reference_from_image(artwork: dict, image_bytes: bytes) -> Reference | None:
    return _ref(artwork, decode_rgb(image_bytes))


def _ref(artwork: dict, rgb: np.ndarray) -> Reference | None:
    kp, des = features(rgb)
    if des is None or len(kp) < 50:
        return None
    return Reference(artwork["id"], artwork["slug"], artwork["title"], artwork.get("artist"), kp, des)


def references_for(artwork: dict, image_bytes: bytes, scope: dict | None) -> list[Reference]:
    """Dua referensi per materi: karya utuh dan area latihannya. Pengguna sering memotret hanya figur
    yang dilatih; di karya utuh (diperkecil) figur kecil itu punya terlalu sedikit titik fitur."""
    rgb = decode_rgb(image_bytes)
    refs = [_ref(artwork, rgb)]
    if scope:
        h, w = rgb.shape[:2]
        sub = rgb[int(scope["y"] * h) : int((scope["y"] + scope["h"]) * h), int(scope["x"] * w) : int((scope["x"] + scope["w"]) * w)]
        if sub.size:
            refs.append(_ref(artwork, sub))
    return [r for r in refs if r]


def score(query: tuple, ref: Reference) -> dict:
    kq, dq = query
    if dq is None or len(kq) < 30:
        return {"inliers": 0, "good": 0, "ratio": 0.0}
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(dq, ref.descriptors, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < RATIO * n.distance]
    if len(good) < 12:
        return {"inliers": 0, "good": len(good), "ratio": 0.0}
    src = np.float32([kq[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([ref.keypoints[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
    inliers = int(mask.sum()) if mask is not None else 0
    return {"inliers": inliers, "good": len(good), "ratio": round(inliers / len(good), 3)}


def best_match(photo: bytes, refs: list[Reference]) -> dict | None:
    """Kandidat terbaik atau None. Kandidat hanya dikembalikan bila lolos ambang inlier dan rasio."""
    query = features(decode_rgb(photo))
    scored = [(score(query, ref), ref) for ref in refs]
    scored.sort(key=lambda t: -t[0]["inliers"])
    if not scored:
        return None
    s, ref = scored[0]
    if s["inliers"] < MIN_INLIERS or s["ratio"] < MIN_INLIER_RATIO:
        return None
    return {"artwork_id": ref.artwork_id, "slug": ref.slug, "title": ref.title, "artist": ref.artist, "score": s["inliers"], "ratio": s["ratio"]}


# ---------------------------------------------------------------- referensi dari katalog (di-cache)

_cache: tuple[float, list[Reference]] | None = None


def published_references() -> list[Reference]:
    """Fitur semua materi koleksi TERBIT. Dihitung sekali lalu disimpan 10 menit di memori worker."""
    global _cache
    if _cache and time.monotonic() - _cache[0] < REF_TTL_SECONDS:
        return _cache[1]
    from core.supabase_client import get_supabase
    from services.storage import with_retry

    db = get_supabase()
    artworks = db.table("artworks").select("id, slug, title, artist, image_path, lesson_versions(scope, version, status)").eq("status", "published").execute().data
    refs = []
    for a in artworks:
        try:
            data = with_retry(lambda p=a["image_path"]: db.storage.from_("catalog").download(p), "download_catalog")
            published = sorted((v for v in a.get("lesson_versions") or [] if v["status"] == "published"), key=lambda v: -v["version"])
            refs += references_for(a, data, published[0]["scope"] if published else None)
        except Exception:
            log.exception("reference_failed", extra={"slug": a["slug"]})
    _cache = (time.monotonic(), refs)
    return refs


def clear_cache() -> None:
    global _cache
    _cache = None
