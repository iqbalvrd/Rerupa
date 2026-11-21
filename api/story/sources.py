"""(B, C) Sumber kisah untuk foto unggahan: kandidat identitas → pencarian sumber web → klaim bersumber.

Aturan (PRD §11.2):
- Isian pengguna = petunjuk. Kandidat identitas dari foto = harus dikonfirmasi pengguna sebelum dipakai.
- Pencarian web hanya memakai TEKS (judul/seniman/asal); foto tidak dikirim ke mesin pencari.
- Klaim menjadi `fakta` hanya bila URL-nya (1) benar-benar ditemukan tool web search (bukan karangan
  model) dan (2) dari domain tepercaya. Selain itu diturunkan menjadi `perkiraan`.
"""

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from ai import openai_client as oc
from story.schemas import Identity, SourceSearch

PROMPTS = Path(__file__).parent / "prompts"

# Museum, arsip, ensiklopedia, pemerintah, lembaga pendidikan. Diperluas bersama tim konten.
TRUSTED_SUFFIXES = (
    ".go.id", ".ac.id", ".gov", ".edu", ".museum",
    "wikipedia.org", "wikimedia.org", "britannica.com", "nationalgallery.sg", "nationalgallery.org.uk",
    "rijksmuseum.nl", "si.edu", "metmuseum.org", "wereldmuseum.nl", "tropenmuseum.nl", "artsandculture.google.com",
    "kemdikbud.go.id", "kebudayaan.kemdikbud.go.id", "museumnasional.or.id", "unesco.org", "persee.fr", "jstor.org",
    "kitlv.nl", "britishmuseum.org", "cooperhewitt.org", "smvk.se", "varldskulturmuseerna.se",
)
_MD_LINK = re.compile(r"\s*\(\[[^\]]*\]\([^)]*\)\)|\s*\[[^\]]*\]\([^)]*\)")


def domain(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def trusted(url: str) -> bool:
    """Domain persis, subdomainnya (id.wikipedia.org), atau akhiran (.go.id) dari daftar tepercaya."""
    d = domain(url)
    if not d:
        return False
    for s in TRUSTED_SUFFIXES:
        if s.startswith("."):
            if d.endswith(s):
                return True
        elif d == s or d.endswith("." + s):
            return True
    return False


def clean_text(text: str) -> str:
    """Hapus tautan Markdown yang disisipkan model ke dalam kalimat; URL disimpan terpisah."""
    return re.sub(r"\s{2,}", " ", _MD_LINK.sub("", text)).strip()


def identify(photo_jpeg: bytes | None, hints: dict, *, safety_id: str, job_id: str | None) -> Identity:
    """Kandidat identitas karya. Foto hanya dikirim bila ada (pengguna sudah setuju)."""
    content: list[dict] = [{"type": "input_text", "text": "Isian pengguna (petunjuk, bisa salah):\n" + json.dumps(hints, ensure_ascii=False)}]
    if photo_jpeg:
        content.append(oc.image_part(photo_jpeg, "image/jpeg", detail="low"))
    res = oc.parse(task="story_identify", instructions=(PROMPTS / "identify.v1.md").read_text(encoding="utf-8"), content=content, schema=Identity, safety_id=safety_id, job_id=job_id, max_output_tokens=800)
    return res.parsed


def search(identity: dict, *, safety_id: str, job_id: str | None, max_searches: int = 3) -> tuple[list[dict], list[dict]]:
    """Cari sumber (teks saja). Return (klaim tervalidasi, sumber). Klaim fakta tanpa kutipan tepercaya → perkiraan."""
    query = {k: identity.get(k) for k in ("title", "artist", "origin") if identity.get(k)}
    content = [{"type": "input_text", "text": f"Karya yang dicari (maksimal {max_searches} pencarian):\n" + json.dumps(query, ensure_ascii=False)}]
    res = oc.parse(task="story_sources", instructions=(PROMPTS / "sources.v1.md").read_text(encoding="utf-8"), content=content, schema=SourceSearch, safety_id=safety_id, job_id=job_id, max_output_tokens=3000, tools=[{"type": "web_search"}])
    return validate_sources(res.parsed, res.citations)


def norm_url(url: str) -> str:
    """Bandingkan URL tanpa skema, www, query, fragmen, dan '/' di akhir (…?hl=en vs tanpa query)."""
    u = urlparse(url.strip())
    return f"{(u.hostname or '').lower().removeprefix('www.')}{u.path.rstrip('/')}"


def validate_sources(out: SourceSearch, seen_urls: list[str]) -> tuple[list[dict], list[dict]]:
    """seen_urls = URL yang benar-benar ditemukan tool pencarian. URL klaim di luar itu dianggap karangan."""
    seen = {norm_url(u) for u in seen_urls}
    sources: dict[str, dict] = {}
    claims = []
    for c in out.claims:
        urls = [u for u in c.source_urls if norm_url(u) in seen and trusted(u)]
        kind = "fakta" if c.type == "fakta" and urls else "perkiraan"
        text = clean_text(c.text)
        if not text:
            continue
        claims.append({"text": text[:280], "type": kind, "source_urls": urls if kind == "fakta" else [], "source_codes": []})
        for u in urls:
            title = next((s.title for s in out.sources if norm_url(s.url) == norm_url(u)), domain(u))
            sources[u] = {"url": u, "title": title[:200], "domain": domain(u)}
    return claims[:6], list(sources.values())
