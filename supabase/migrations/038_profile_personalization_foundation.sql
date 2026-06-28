alter table if exists public.users
  add column if not exists date_of_birth date,
  add column if not exists body_fat_pct numeric(4,1),
  add column if not exists work_activity_level text,
  add column if not exists exercise_sessions_per_week smallint,
  add column if not exists exercise_minutes_per_session smallint,
  add column if not exists sweat_level text;

alter table if exists public.users
  drop constraint if exists users_body_fat_pct_range,
  add constraint users_body_fat_pct_range
    check (body_fat_pct is null or body_fat_pct between 3 and 70),
  drop constraint if exists users_work_activity_level_allowed,
  add constraint users_work_activity_level_allowed
    check (work_activity_level is null or work_activity_level in ('sedentary', 'light', 'moderate', 'heavy')),
  drop constraint if exists users_exercise_sessions_range,
  add constraint users_exercise_sessions_range
    check (exercise_sessions_per_week is null or exercise_sessions_per_week between 0 and 21),
  drop constraint if exists users_exercise_minutes_range,
  add constraint users_exercise_minutes_range
    check (exercise_minutes_per_session is null or exercise_minutes_per_session between 0 and 600),
  drop constraint if exists users_sweat_level_allowed,
  add constraint users_sweat_level_allowed
    check (sweat_level is null or sweat_level in ('low', 'moderate', 'high'));

comment on column public.users.date_of_birth is
  'Preferred source for age calculation. Legacy age remains for backward compatibility.';
comment on column public.users.work_activity_level is
  'Daily occupational movement, stored separately from planned exercise.';
