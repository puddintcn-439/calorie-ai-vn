-- Intervention memory: track which behavior interventions were shown and whether users acted.

create table if not exists public.user_intervention_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  intervention_type text not null,
  mode text not null,
  priority text not null,
  primary_action text not null,
  event_type text not null check (event_type in ('shown', 'acted', 'dismissed')),
  source text not null default 'today',
  forecast_score integer,
  intervention_generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_intervention_events enable row level security;

drop policy if exists "Users manage own intervention events" on public.user_intervention_events;
create policy "Users manage own intervention events"
  on public.user_intervention_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_intervention_events_user_created_idx
  on public.user_intervention_events(user_id, created_at desc);

create index if not exists user_intervention_events_user_type_idx
  on public.user_intervention_events(user_id, intervention_type, created_at desc);

create index if not exists user_intervention_events_user_event_idx
  on public.user_intervention_events(user_id, event_type, created_at desc);
