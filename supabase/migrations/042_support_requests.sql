create extension if not exists "pgcrypto";

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('account', 'technical', 'ai_result', 'health_data', 'billing', 'feedback', 'other')),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  app_version text,
  platform text,
  admin_reply text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_requests_user_created
  on public.support_requests(user_id, created_at desc);

create index if not exists idx_support_requests_status_created
  on public.support_requests(status, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists "Users can view own support requests" on public.support_requests;
create policy "Users can view own support requests"
  on public.support_requests for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own support requests" on public.support_requests;
create policy "Users can create own support requests"
  on public.support_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access on support requests" on public.support_requests;
create policy "Service role full access on support requests"
  on public.support_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
