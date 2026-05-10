-- ==========================================
-- User Daily Roadmap table
-- ==========================================
create table if not exists public.user_daily_roadmap (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  logged_date     date not null,                          -- date of the roadmap (YYYY-MM-DD)
  task_id         text not null,                          -- identifier for the task (e.g., "WALK_30", custom-uuid)
  task_title      text not null,                          -- title of the exercise
  activity_type   text not null,                          -- e.g. 'walking', 'running', 'yoga', etc.
  duration_min    integer not null default 30,            -- planned duration in minutes
  estimated_kcal  integer not null default 0,             -- estimated calories to burn
  is_custom       boolean default false,                  -- true if user-added, false if system-suggested
  is_removed      boolean default false,                  -- true if user deleted a system suggestion
  is_completed    boolean default false,                  -- true if task completed for the day
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.user_daily_roadmap enable row level security;

drop policy if exists "Users manage own roadmap" on public.user_daily_roadmap;
create policy "Users manage own roadmap"
  on public.user_daily_roadmap for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_daily_roadmap_user_date on public.user_daily_roadmap (user_id, logged_date);
create index if not exists user_daily_roadmap_user_task on public.user_daily_roadmap (user_id, task_id);
