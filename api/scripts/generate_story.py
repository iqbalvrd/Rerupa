"""Buat atau terbitkan storyline materi koleksi (dibuat sekali, ditinjau, lalu dipakai bersama semua pengguna).

Dari folder api/:
    uv run --group cv python scripts/generate_story.py <slug>              # draf, gambar gpt-image-2.6-flare
    uv run --group cv python scripts/generate_story.py <slug> --final      # aset final, gpt-image-2.6-sunburst (lebih mahal)
    uv run --group cv python scripts/generate_story.py <slug> --publish    # terbitkan cerita yang SUDAH ditinjau

Cerita dibuat untuk versi lesson terbaru materi itu (draf maupun terbit). Pengguna hanya melihat cerita
yang `review_status = published` dan lesson-nya terbit.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.supabase_client import get_supabase  # noqa: E402
from story.service import build_story  # noqa: E402


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--final", action="store_true", help="aset final (sunburst, kualitas tinggi)")
    ap.add_argument("--publish", action="store_true", help="terbitkan cerita yang sudah ada (setelah ditinjau)")
    ap.add_argument("--reviewer", default=None)
    args = ap.parse_args()
    db = get_supabase()
    art = db.table("artworks").select("id, slug").eq("slug", args.slug).limit(1).execute().data
    if not art:
        sys.exit(f"materi tidak ditemukan: {args.slug}")
    lv = db.table("lesson_versions").select("id, version, status").eq("artwork_id", art[0]["id"]).order("version", desc=True).limit(1).execute().data[0]

    if args.publish:
        st = db.table("stories").select("id, status").eq("lesson_version_id", lv["id"]).is_("session_id", "null").limit(1).execute().data
        if not st or st[0]["status"] not in ("ready", "text_only"):
            sys.exit("belum ada cerita siap untuk versi ini")
        db.table("stories").update({"review_status": "published"}).eq("id", st[0]["id"]).execute()
        if args.reviewer:
            db.table("content_reviews").insert({"subject_type": "story_panel", "subject_id": st[0]["id"], "kind": "panel", "reviewer": args.reviewer, "decision": "approved"}).execute()
        print(f"terbit: story {st[0]['id']} (lesson v{lv['version']}, status lesson {lv['status']})")
        return

    out = build_story(lv["id"], None, {}, safety_id="rs_collection", job_id=None, final=args.final, progress=lambda s: print("·", s, flush=True))
    story = db.table("stories").select("id, status, story_basis, title, summary, story_panels(order_no, kind, status, narration)").eq("id", out.story_id).limit(1).execute().data[0]
    story["story_panels"] = sorted(story["story_panels"], key=lambda p: p["order_no"])
    print(json.dumps(story, ensure_ascii=False, indent=2))
    print("\nTinjau panel di Storage (catalog/artworks/<slug>/story/…), lalu jalankan dengan --publish.")


if __name__ == "__main__":
    main()
