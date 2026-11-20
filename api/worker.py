"""Worker Rerupa: mengambil job dari tabel `jobs` dan menjalankannya.

Jalankan dari folder api/: uv run python worker.py
Loop klaim job (FOR UPDATE SKIP LOCKED) diisi di Fase 1.
"""

import time


def main() -> None:
    print("Worker Rerupa jalan. Antrean job belum diimplementasikan (Fase 1).")
    while True:
        time.sleep(5)


if __name__ == "__main__":
    main()
