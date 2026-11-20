-- Fase 1 · Migrasi 9: indeks untuk foreign key (saran advisor performa Supabase)

create index if not exists ai_usage_job_idx               on ai_usage (job_id);
create index if not exists artwork_sources_source_idx     on artwork_sources (source_id);
create index if not exists culture_entry_sources_src_idx  on culture_entry_sources (source_id);
create index if not exists jobs_upload_idx                on jobs (upload_id);
create index if not exists practice_sessions_palette_idx  on practice_sessions (palette_id);
