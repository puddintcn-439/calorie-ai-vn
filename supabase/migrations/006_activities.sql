-- ==========================================
-- Activity logs table
-- ==========================================
create table if not exists public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  activity_type   text not null,                          -- e.g. 'running', 'walking', 'cycling'
  activity_name   text,                                   -- custom label
  duration_min    integer not null default 30,
  calories_burned integer not null default 0,
  logged_at       timestamptz not null default now(),
  notes           text,
  created_at      timestamptz default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists "Users manage own activity logs" on public.activity_logs;
create policy "Users manage own activity logs"
  on public.activity_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists activity_logs_user_date on public.activity_logs (user_id, logged_at);
