-- Food logging polish: editable logs, undo delete, and saved-meal edits.

alter table public.food_logs
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists food_logs_user_active_date_idx
  on public.food_logs(user_id, logged_at desc)
  where deleted_at is null;

create or replace function public.update_food_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists food_logs_updated_at on public.food_logs;
create trigger food_logs_updated_at
  before update on public.food_logs
  for each row execute function public.update_food_logs_updated_at();

alter table public.saved_meals
  add column if not exists total_fiber_g numeric(6,2),
  add column if not exists total_sugar_g numeric(6,2),
  add column if not exists total_saturated_fat_g numeric(6,2),
  add column if not exists total_sodium_mg numeric(7,1),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.update_saved_meals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_meals_updated_at on public.saved_meals;
create trigger saved_meals_updated_at
  before update on public.saved_meals
  for each row execute function public.update_saved_meals_updated_at();
