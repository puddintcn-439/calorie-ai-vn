-- ==========================================
-- Add exercises jsonb column to activity_logs
-- ==========================================
alter table if exists public.activity_logs
  add column if not exists exercises jsonb default '[]'::jsonb;

-- No change to RLS policies; exercises is user-provided JSONB with no special constraints.
