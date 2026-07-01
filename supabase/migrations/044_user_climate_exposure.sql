alter table public.users
  add column if not exists climate_exposure text;

alter table public.users
  drop constraint if exists users_climate_exposure_allowed,
  add constraint users_climate_exposure_allowed
    check (climate_exposure is null or climate_exposure in ('cool_controlled', 'temperate', 'hot_humid', 'extreme_heat'));

comment on column public.users.climate_exposure is
  'Typical daily climate exposure used as a hydration product heuristic.';
