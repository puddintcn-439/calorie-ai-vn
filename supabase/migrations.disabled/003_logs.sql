-- ==========================================
-- FOOD LOGS TABLE
-- ==========================================
create table if not exists public.food_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  food_id           uuid references public.foods(id),
  meal_type         text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  logged_at         timestamptz not null default now(),
  quantity          numeric(6,2) not null default 1,
  unit              text not null default 'gram',
  estimated_grams   numeric(7,1) not null,
  calories          numeric(7,1) not null,
  protein_g         numeric(6,2) not null default 0,
  carbs_g           numeric(6,2) not null default 0,
  fat_g             numeric(6,2) not null default 0,
  name              text not null,
  name_vi           text,
  image_url         text,
  source            text not null check (source in ('ai_scan','manual_search','manual_entry','quick_add')),
  ai_scan_id        uuid,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx on public.food_logs(user_id, logged_at desc);
create index if not exists food_logs_meal_type_idx on public.food_logs(meal_type);

-- RLS: users see only their own logs
alter table public.food_logs enable row level security;

drop policy if exists "Users manage own logs" on public.food_logs;
create policy "Users manage own logs"
  on public.food_logs for all
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on logs" on public.food_logs;
create policy "Service role full access on logs"
  on public.food_logs for all
  using (auth.role() = 'service_role');
