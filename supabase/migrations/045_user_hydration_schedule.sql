alter table public.users
  add column if not exists hydration_schedule jsonb;

alter table public.users
  drop constraint if exists users_hydration_schedule_is_object,
  add constraint users_hydration_schedule_is_object
    check (hydration_schedule is null or jsonb_typeof(hydration_schedule) = 'object');

comment on column public.users.hydration_schedule is
  'User hydration schedule mode and editable time/amount slots.';
