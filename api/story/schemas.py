"""Skema keluaran AI untuk storyline (structured output). Batas isi ditegakkan di story/validators.py."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Identity(_Strict):
    """Kandidat identitas karya dari foto (+ isian). Hanya kandidat: wajib dikonfirmasi pengguna."""

    identified: bool
    title: str
    artist: str
    origin: str
    confidence: Literal["high", "medium", "low"]
    reason: str


class SourcedClaim(_Strict):
    text: str
    type: Literal["fakta", "perkiraan"]
    source_urls: list[str]


class Source(_Strict):
    url: str
    title: str


class SourceSearch(_Strict):
    found: bool
    claims: list[SourcedClaim]
    sources: list[Source]


class Character(_Strict):
    code: str  # c1, c2, …
    name: str
    description: str  # deskripsi visual terkunci: pakaian, warna, ciri — dipakai di semua panel
    region_codes: list[str]


class Panel(_Strict):
    order_no: int
    narration: str  # ≤40 kata, Bahasa Indonesia
    scene: str  # deskripsi visual untuk pembuat gambar
    character_codes: list[str]
    focus_region_codes: list[str]
    use_artwork_crop: bool  # adegan yang memang ada di karya → pakai potongan karya asli


class Storyboard(_Strict):
    title: str
    summary: str
    style_guide: str
    characters: list[Character]
    panels: list[Panel]


class PanelCheck(_Strict):
    consistent: bool
    issues: list[str]
