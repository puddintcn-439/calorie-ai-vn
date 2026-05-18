-- Persistent activity preferences selected by the user in Profile.
-- Today and Log read these templates to suggest/log calorie-burning activity.

create table if not exists public.user_activity_preferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         text not null,
  activity_type text not null check (activity_type in ('running','walking','cycling','swimming','gym','yoga','football','basketball','other')),
  duration_min  integer not null default 30 check (duration_min between 1 and 600),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.user_activity_preferences enable row level security;

drop policy if exists "Users manage own activity preferences" on public.user_activity_preferences;
create policy "Users manage own activity preferences"
  on public.user_activity_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_activity_preferences_user_active_order_idx
  on public.user_activity_preferences (user_id, is_active, sort_order, created_at);
