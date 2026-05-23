-- Add goal_plan JSONB column to users for storing personalized weight goals
alter table if exists public.users
  add column if not exists goal_plan jsonb;

alter table if exists public.users
  drop constraint if exists users_goal_plan_is_object;

alter table if exists public.users
  add constraint users_goal_plan_is_object
  check (goal_plan is null or jsonb_typeof(goal_plan) = 'object');


