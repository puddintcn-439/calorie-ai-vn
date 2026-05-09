-- ==========================================
-- REMINDER PREFERENCES TABLE
-- ==========================================
-- Stores user notification preferences and reminder times
create table if not exists public.reminder_preferences (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  breakfast_reminder_enabled boolean not null default true,
  breakfast_reminder_time text not null default '07:00',
  lunch_reminder_enabled boolean not null default true,
  lunch_reminder_time text not null default '12:00',
  dinner_reminder_enabled boolean not null default true,
  dinner_reminder_time text not null default '19:00',
  snack_reminder_enabled boolean not null default false,
  snack_reminder_time text not null default '15:00',
  allow_push_notifications boolean not null default true,
  nudge_motivation_style text not null default 'encouraging' check (nudge_motivation_style in ('encouraging','warning','neutral')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index reminder_preferences_user_idx on public.reminder_preferences(user_id);

-- RLS: users see only their own preferences
alter table public.reminder_preferences enable row level security;

create policy "Users manage own preferences"
  on public.reminder_preferences for all
  using (auth.uid() = user_id);

create policy "Service role full access on preferences"
  on public.reminder_preferences for all
  using (auth.role() = 'service_role');
