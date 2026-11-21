# Image yang sama untuk dua service Railway/Fly:
#   api    : perintah bawaan (uvicorn)
#   worker : start command "python worker.py"
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    HF_HOME=/app/.cache/huggingface \
    U2NET_HOME=/app/.cache/u2net \
    OMP_NUM_THREADS=2

# libgomp1: onnxruntime/torch (CPU), libglib2.0-0: opencv
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv

WORKDIR /app

# Dependensi dulu (lapisan cache), kode belakangan.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --group cv --no-group dev --no-install-project

COPY . .

# Bobot model diunduh saat build (bukan saat pengguna pertama datang): rembg u2net,
# TEED, dan Informative Drawings (±350 MB). Setelah itu runtime tidak butuh Hugging Face.
RUN uv run --no-sync python -c "from cv.models import warm_up; print(warm_up('teed', 'u2net')); print(warm_up('model', None))"
ENV HF_HUB_OFFLINE=1

RUN useradd --create-home --uid 10001 rerupa && chown -R rerupa /app
USER rerupa

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# --proxy-headers: skema https dari proxy Railway; IP klien untuk rate limit dibaca di core/ratelimit.py
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --workers 1"]
