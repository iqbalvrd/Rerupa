-- Akun pengguna (Supabase Auth, email + password) dan peran admin.
-- * profiles: satu baris per auth.users, dibuat trigger saat pendaftaran. Peran hanya diubah backend
--   (service role) — klien tidak pernah menulis tabel ini dan klaim peran dari klien tidak dipercaya.
-- * Admin awal ditentukan backend lewat variabel ADMIN_EMAILS (email terverifikasi), jadi alamat
--   email tidak ditulis di repo. Admin lain bisa diangkat dari halaman admin (profiles.role).
-- * practice_sessions.user_id: sesi latihan milik akun. Sesi tamu lama (null) diklaim saat dipakai login.

create type user_role as enum ('user', 'admin');

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on profiles (role) where role = 'admin';

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Pola sama dengan tabel lain: RLS aktif tanpa policy, anon/authenticated tanpa hak → hanya service role.
alter table profiles enable row level security;
revoke all on profiles from anon, authenticated;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Email yang diganti lewat Supabase Auth ikut diperbarui.
create or replace function handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
revoke all on function handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function handle_user_email_change();

-- Akun yang sudah ada sebelum migrasi ini.
insert into profiles (id, email) select id, coalesce(email, '') from auth.users on conflict (id) do nothing;

-- set null (bukan cascade): sesi akun yang dihapus tetap dibersihkan pekerjaan retensi beserta file Storage-nya.
alter table practice_sessions add column user_id uuid references auth.users(id) on delete set null;
create index practice_sessions_user_idx on practice_sessions (user_id) where user_id is not null;
