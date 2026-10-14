-- Run in the Supabase SQL Editor. Safe to run again for this application schema.
-- Browser clients use only the publishable (or legacy anon) key, never a service-role key.
begin;

create table if not exists public.work_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null check (date >= date '0001-01-01' and date <= date '9999-12-31'),
  minutes integer not null check (minutes between 0 and 1440),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Upgrade earlier installs without changing their recorded hours or notes.
-- Existing rows receive completed, matching the legacy device-history default.
alter table public.work_entries
  add column if not exists status text not null default 'completed';
alter table public.work_entries drop constraint if exists work_entries_status_check;
alter table public.work_entries add constraint work_entries_status_check
  check (status in ('completed', 'reserved'));

alter table public.work_entries enable row level security;

revoke all on table public.work_entries from anon;
revoke all on table public.work_entries from authenticated;
grant select, insert, update, delete on table public.work_entries to authenticated;

-- The primary key's leading user_id column also indexes the RLS lookup.
drop policy if exists "Read own work entries" on public.work_entries;
create policy "Read own work entries" on public.work_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Insert own work entries" on public.work_entries;
create policy "Insert own work entries" on public.work_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own work entries" on public.work_entries;
create policy "Update own work entries" on public.work_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own work entries" on public.work_entries;
create policy "Delete own work entries" on public.work_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_work_entry_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_work_entry_updated_at() from public;
drop trigger if exists work_entry_updated_at on public.work_entries;
create trigger work_entry_updated_at
  before update on public.work_entries
  for each row execute function public.set_work_entry_updated_at();

commit;
