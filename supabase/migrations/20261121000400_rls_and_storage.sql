-- Fase 1 · Migrasi 4: kunci akses (ERD §8)
-- RLS aktif tanpa policy untuk anon/authenticated → hanya service role (FastAPI) yang bisa akses.

alter table sources               enable row level security;
alter table culture_entries       enable row level security;
alter table culture_entry_sources enable row level security;
alter table content_reviews       enable row level security;
alter table artworks              enable row level security;
alter table artwork_sources       enable row level security;
alter table palettes              enable row level security;
alter table paints                enable row level security;
alter table color_recipes         enable row level security;
alter table practice_sessions     enable row level security;
alter table uploads               enable row level security;
alter table jobs                  enable row level security;
alter table ai_usage              enable row level security;

-- Fungsi utilitas tidak perlu bisa dipanggil dari luar
revoke all on function set_updated_at() from public, anon, authenticated;

-- Bucket Storage privat (diakses lewat signed URL dari API)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('catalog', 'catalog', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('uploads', 'uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('derived', 'derived', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/json'])
on conflict (id) do nothing;
