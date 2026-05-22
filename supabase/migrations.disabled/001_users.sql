-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- USERS TABLE
-- ==========================================
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text,
  avatar_url    text,
  weight_kg     numeric(5,2),
  height_cm     numeric(5,1),
  age           smallint check (age between 13 and 120),
  gender        text check (gender in ('male', 'female')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal          text check (goal in ('lose_weight', 'maintain', 'gain_muscle')),
  daily_calorie_target integer default 1800,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;

drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

drop policy if exists "Service role full access on users" on public.users;
create policy "Service role full access on users"
  on public.users for all
  using (auth.role() = 'service_role');
