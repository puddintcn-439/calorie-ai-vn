-- ==========================================
-- Per-meal targets + profile fields
-- ==========================================
alter table public.users
  add column if not exists target_breakfast_cal integer default 400,
  add column if not exists target_lunch_cal     integer default 600,
  add column if not exists target_dinner_cal    integer default 600,
  add column if not exists target_snack_cal     integer default 200;
