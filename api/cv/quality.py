"""Cek kualitas foto sebelum diproses: buram, gelap, silau, kontras rendah.

Ambang awal — dikalibrasi ulang setelah uji pada foto nyata (eval/).
"""

import cv2
import numpy as np

from cv.types import Quality

BLUR_MIN = 40.0  # varians Laplacian pada versi 512 px
BRIGHTNESS_MIN = 45.0
BRIGHTNESS_MAX = 235.0
CONTRAST_MIN = 12.0
GLARE_MAX_PCT = 12.0


def assess(img: np.ndarray) -> Quality:
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    scale = 512 / max(h, w)
    if scale < 1:
        gray = cv2.resize(gray, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)

    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())
    glare_pct = float((gray >= 250).mean() * 100)

    reasons = []
    if blur < BLUR_MIN:
        reasons.append("blurry")
    if brightness < BRIGHTNESS_MIN:
        reasons.append("too_dark")
    if brightness > BRIGHTNESS_MAX:
        reasons.append("too_bright")
    if contrast < CONTRAST_MIN:
        reasons.append("low_contrast")
    if glare_pct > GLARE_MAX_PCT:
        reasons.append("glare")

    return Quality(
        usable=not reasons,
        blur=round(blur, 1),
        brightness=round(brightness, 1),
        contrast=round(contrast, 1),
        glare_pct=round(glare_pct, 2),
        reasons=reasons,
    )
