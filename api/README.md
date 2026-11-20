# Rerupa API

Backend FastAPI + worker untuk Rerupa. Lihat `../SYSTEM_ARCHITECTURE.md` dan `../RENCANA_PENGERJAAN.md`.

## Menjalankan lokal

```bash
cd api
cp .env.example .env   # lalu isi nilainya
uv sync --group cv     # dependensi dasar + computer vision
uv run uvicorn main:app --reload
```

Worker (terminal terpisah):

```bash
uv run python worker.py
```

Cek: http://localhost:8000/health dan dokumentasi API di http://localhost:8000/docs
