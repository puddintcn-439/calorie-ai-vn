-- ==========================================
-- LOGGING FUNNEL EVENTS TABLE
-- ==========================================
-- Tracks core logging funnel events for product analytics

create table if not exists public.logging_events (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  event_type        text not null check (event_type in ('log_attempted', 'log_parsed', 'log_failed')),
  input_mode        text not null check (input_mode in ('image', 'text', 'voice', 'receipt', 'barcode', 'search')),
  elapsed_ms        integer,
  correction_count  integer,
  item_count        integer,
  ai_confidence     numeric(4,3),
  reason_code       text,
  metadata          jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists logging_events_user_idx on public.logging_events(user_id);
create index if not exists logging_events_type_idx on public.logging_events(event_type);
create index if not exists logging_events_mode_idx on public.logging_events(input_mode);
create index if not exists logging_events_created_idx on public.logging_events(created_at);
create index if not exists logging_events_user_created_idx on public.logging_events(user_id, created_at desc);

alter table public.logging_events enable row level security;

create policy "Users manage own logging events"
  on public.logging_events for all
  using (auth.uid() = user_id);

create policy "Service role full access on logging events"
  on public.logging_events for all
  using (auth.role() = 'service_role');
