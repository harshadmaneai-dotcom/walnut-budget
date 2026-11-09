-- Walnut: one budget document per account.
-- Run this in the Supabase dashboard → SQL Editor for project mucbgkqwqeqvtgmxplnu.
-- The old single-user table (budget_tracker_data) is left untouched as a backup.

create table if not exists public.walnut_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  version    integer not null default 2,
  data       jsonb   not null,
  updated_at timestamptz not null default now()
);

alter table public.walnut_data enable row level security;

-- The publishable key ships in the browser bundle, so anonymous access gets nothing.
revoke all on table public.walnut_data from anon;
grant select, insert, update, delete on table public.walnut_data to authenticated;

drop policy if exists "walnut read own"   on public.walnut_data;
drop policy if exists "walnut insert own" on public.walnut_data;
drop policy if exists "walnut update own" on public.walnut_data;
drop policy if exists "walnut delete own" on public.walnut_data;

create policy "walnut read own"
  on public.walnut_data for select
  to authenticated
  using (auth.uid() = user_id);

create policy "walnut insert own"
  on public.walnut_data for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "walnut update own"
  on public.walnut_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "walnut delete own"
  on public.walnut_data for delete
  to authenticated
  using (auth.uid() = user_id);

-- Server-side timestamp, so a client clock can't rewrite history.
create or replace function public.walnut_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists walnut_touch on public.walnut_data;
create trigger walnut_touch
  before insert or update on public.walnut_data
  for each row execute function public.walnut_touch();
