alter table if exists public.users
  add column if not exists nutrition_target_snapshot jsonb,
  add column if not exists nutrition_algorithm_version text,
  add column if not exists nutrition_target_calculated_at timestamptz;

alter table if exists public.users
  drop constraint if exists users_nutrition_target_snapshot_object;

alter table if exists public.users
  add constraint users_nutrition_target_snapshot_object
    check (
      nutrition_target_snapshot is null
      or jsonb_typeof(nutrition_target_snapshot) = 'object'
    );

comment on column public.users.nutrition_target_snapshot is
  'Latest backend-generated nutrition target with per-metric methodology and evidence metadata. It is a wellness estimate unless status=clinician_target.';

comment on column public.users.nutrition_algorithm_version is
  'Immutable identifier of the recommendation algorithm that generated nutrition_target_snapshot.';

create table if not exists public.daily_nutrition_target_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_date date not null,
  algorithm_version text not null,
  target_status text not null,
  target_snapshot jsonb not null,
  recorded_at timestamptz not null default now(),
  constraint daily_nutrition_target_history_snapshot_object
    check (jsonb_typeof(target_snapshot) = 'object'),
  constraint daily_nutrition_target_history_status
    check (target_status in ('ready', 'needs_profile', 'clinician_guidance', 'clinician_target'))
);

alter table public.daily_nutrition_target_history enable row level security;

drop policy if exists "Users can view own nutrition target history"
  on public.daily_nutrition_target_history;
create policy "Users can view own nutrition target history"
  on public.daily_nutrition_target_history for select
  using (auth.uid() = user_id);

create index if not exists daily_nutrition_target_history_user_date_idx
  on public.daily_nutrition_target_history(user_id, target_date desc, recorded_at desc);

create index if not exists daily_nutrition_target_history_version_idx
  on public.daily_nutrition_target_history(user_id, target_date, algorithm_version, recorded_at desc);

create or replace function public.snapshot_user_nutrition_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nutrition_target_snapshot is not null
    and (
      old.nutrition_target_snapshot is distinct from new.nutrition_target_snapshot
      or old.nutrition_algorithm_version is distinct from new.nutrition_algorithm_version
    )
  then
    insert into public.daily_nutrition_target_history (
      user_id,
      target_date,
      algorithm_version,
      target_status,
      target_snapshot
    ) values (
      new.id,
      coalesce(
        nullif(new.nutrition_target_snapshot ->> 'date', '')::date,
        current_date
      ),
      coalesce(new.nutrition_algorithm_version, 'unknown'),
      coalesce(new.nutrition_target_snapshot ->> 'status', 'needs_profile'),
      new.nutrition_target_snapshot
    );
  end if;
  return new;
end;
$$;

drop trigger if exists users_nutrition_target_snapshot_history on public.users;
create trigger users_nutrition_target_snapshot_history
  after update of nutrition_target_snapshot, nutrition_algorithm_version on public.users
  for each row execute function public.snapshot_user_nutrition_target();
