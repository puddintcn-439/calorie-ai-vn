create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 2000),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_hydration_logs_user_logged
  on public.hydration_logs(user_id, logged_at desc);

alter table public.hydration_logs enable row level security;

drop policy if exists "Users manage own hydration logs" on public.hydration_logs;
create policy "Users manage own hydration logs"
  on public.hydration_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access on hydration logs" on public.hydration_logs;
create policy "Service role full access on hydration logs"
  on public.hydration_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
