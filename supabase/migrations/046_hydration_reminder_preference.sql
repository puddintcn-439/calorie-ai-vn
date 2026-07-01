alter table public.reminder_preferences
  add column if not exists hydration_reminder_enabled boolean not null default true;

comment on column public.reminder_preferences.hydration_reminder_enabled is
  'Whether device hydration notifications should follow the user hydration schedule.';
