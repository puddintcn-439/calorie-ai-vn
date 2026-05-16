alter table public.foods
  add column if not exists saturated_fat_g numeric(6,2);

alter table public.food_logs
  add column if not exists fiber_g numeric(6,2),
  add column if not exists sugar_g numeric(6,2),
  add column if not exists saturated_fat_g numeric(6,2),
  add column if not exists sodium_mg numeric(7,1);

alter table public.saved_meals
  add column if not exists total_fiber_g numeric(6,2) not null default 0,
  add column if not exists total_sugar_g numeric(6,2) not null default 0,
  add column if not exists total_saturated_fat_g numeric(6,2) not null default 0,
  add column if not exists total_sodium_mg numeric(7,1) not null default 0;
