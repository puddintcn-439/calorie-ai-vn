-- Push notification hardening: device metadata, local-time reminders, and anti-spam log.

create extension if not exists "uuid-ossp";

create table if not exists public.reminder_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.users(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_notification_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  active boolean not null default true,
  device_id text,
  app_version text,
  timezone text,
  timezone_offset_minutes integer,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_notification_tokens
  add column if not exists active boolean not null default true,
  add column if not exists device_id text,
  add column if not exists app_version text,
  add column if not exists timezone text,
  add column if not exists timezone_offset_minutes integer,
  add column if not exists last_registered_at timestamptz not null default now();

create table if not exists public.reminder_notification_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  local_date date not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token, meal_type, local_date)
);

create index if not exists reminder_preferences_user_idx on public.reminder_preferences(user_id);
create index if not exists push_tokens_user_idx on public.push_notification_tokens(user_id);
create index if not exists push_tokens_active_user_idx on public.push_notification_tokens(user_id, active);
create index if not exists reminder_notification_log_user_date_idx on public.reminder_notification_log(user_id, local_date);

alter table public.reminder_preferences enable row level security;
alter table public.push_notification_tokens enable row level security;
alter table public.reminder_notification_log enable row level security;

drop policy if exists "Users manage own preferences" on public.reminder_preferences;
create policy "Users manage own preferences"
  on public.reminder_preferences for all
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on preferences" on public.reminder_preferences;
create policy "Service role full access on preferences"
  on public.reminder_preferences for all
  using (auth.role() = 'service_role');

drop policy if exists "Users manage own push tokens" on public.push_notification_tokens;
create policy "Users manage own push tokens"
  on public.push_notification_tokens for all
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on push tokens" on public.push_notification_tokens;
create policy "Service role full access on push tokens"
  on public.push_notification_tokens for all
  using (auth.role() = 'service_role');

drop policy if exists "Users read own reminder notification log" on public.reminder_notification_log;
create policy "Users read own reminder notification log"
  on public.reminder_notification_log for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on reminder notification log" on public.reminder_notification_log;
create policy "Service role full access on reminder notification log"
  on public.reminder_notification_log for all
  using (auth.role() = 'service_role');
