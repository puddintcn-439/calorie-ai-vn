-- ==========================================
-- SAVED MEALS TABLE
-- ==========================================
create table if not exists public.saved_meals (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  items       jsonb not null default '[]',   -- Array of {name, name_vi, calories, protein_g, carbs_g, fat_g, estimated_grams}
  total_calories  numeric(7,1) not null default 0,
  total_protein_g numeric(6,2) not null default 0,
  total_carbs_g   numeric(6,2) not null default 0,
  total_fat_g     numeric(6,2) not null default 0,
  use_count   integer not null default 0,
  last_used_at timestamptz,
  created_at  timestamptz not null default now()
);

create index saved_meals_user_idx on public.saved_meals(user_id, use_count desc);

alter table public.saved_meals enable row level security;

create policy "Users manage own saved meals"
  on public.saved_meals for all
  using (auth.uid() = user_id);
