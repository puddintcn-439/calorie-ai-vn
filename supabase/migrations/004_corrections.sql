-- ==========================================
-- CORRECTION EVENTS TABLE
-- ==========================================
-- Tracks user corrections to AI predictions for quality improvement
create table if not exists public.correction_events (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  event_type        text not null check (event_type in ('item_mismatch','portion_adjusted','confidence_low','ai_result_corrected')),
  food_id           uuid,
  food_name         text,
  original_calories numeric(7,1),
  corrected_calories numeric(7,1),
  original_portion  numeric(6,2),
  corrected_portion numeric(6,2),
  original_portion_unit text,
  ai_confidence     numeric(3,2),
  scan_image_url    text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index correction_events_user_idx on public.correction_events(user_id);
create index correction_events_type_idx on public.correction_events(event_type);
create index correction_events_date_idx on public.correction_events(created_at);
create index correction_events_user_date_idx on public.correction_events(user_id, created_at desc);

-- RLS: users see only their own corrections
alter table public.correction_events enable row level security;

create policy "Users manage own corrections"
  on public.correction_events for all
  using (auth.uid() = user_id);

create policy "Service role full access on corrections"
  on public.correction_events for all
  using (auth.role() = 'service_role');
