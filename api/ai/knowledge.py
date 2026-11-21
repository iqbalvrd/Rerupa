"""Basis pengetahuan budaya yang boleh dikutip AI sebagai fakta (hanya entri terbit + sumbernya)."""

from core.supabase_client import get_supabase


def load_culture_kb(limit: int = 60) -> tuple[list[dict], set[str]]:
    """Return (entri ringkas untuk prompt, himpunan kode sumber yang sah)."""
    rows = (
        get_supabase()
        .table("culture_entries")
        .select("code, kind, name, summary, culture_entry_sources(sources(code, title))")
        .eq("status", "published")
        .limit(limit)
        .execute()
        .data
    )
    entries, source_codes = [], set()
    for r in rows:
        sources = [link["sources"] for link in r.get("culture_entry_sources") or [] if link.get("sources")]
        codes = [s["code"] for s in sources]
        source_codes.update(codes)
        entries.append({"code": r["code"], "kind": r["kind"], "name": r["name"], "summary": r["summary"], "source_codes": codes})
    return entries, source_codes
