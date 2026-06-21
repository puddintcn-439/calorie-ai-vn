-- ============================================================
-- SCHEMA AUDIT: run against production Supabase to see
-- what tables/columns exist vs what the codebase expects.
-- Safe to run: SELECT only, no mutations.
-- ============================================================

-- 1. Which of our expected tables actually exist?
select
  t.table_name,
  case when t.table_name in (
    'users','foods','food_logs','saved_meals','correction_events',
    'activity_logs','logging_events','user_context_events',
    'push_notification_tokens','reminder_preferences','reminder_notification_log',
    'user_subscriptions','billing_customers','billing_subscriptions',
    'billing_invoices','billing_refunds','billing_events',
    'user_behavioral_patterns','user_coaching_insights','user_coaching_summaries',
    'body_progress','user_daily_roadmap','user_activity_preferences',
    'user_intervention_events','behavior_forecast_snapshots','ai_usage_events',
    'admin_audit_log','admin_roles','admin_quota_adjustments'
  ) then 'EXPECTED' else 'EXTRA' end as status
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
order by t.table_name;

-- 2. Expected tables that are MISSING from production
select unnest(array[
  'users','foods','food_logs','saved_meals','correction_events',
  'activity_logs','logging_events','user_context_events',
  'push_notification_tokens','reminder_preferences','reminder_notification_log',
  'user_subscriptions','billing_customers','billing_subscriptions',
  'billing_invoices','billing_refunds','billing_events',
  'user_behavioral_patterns','user_coaching_insights','user_coaching_summaries',
  'body_progress','user_daily_roadmap','user_activity_preferences',
  'user_intervention_events','behavior_forecast_snapshots','ai_usage_events',
  'admin_audit_log','admin_roles','admin_quota_adjustments'
]) as expected_table
except
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by expected_table;

-- 3. Key columns on users table
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'users'
order by ordinal_position;

-- 4. Which expected functions exist?
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('reserve_ai_usage_event', 'finalize_ai_usage_event',
                       'touch_admin_roles_updated_at', 'update_body_progress_updated_at',
                       'set_behavior_forecast_snapshot_updated_at')
order by routine_name;

-- 5. Which expected views exist?
select table_name as view_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'beta_intervention_performance_30d', 'beta_reminder_fatigue_weekly',
    'beta_forecast_accuracy_weekly', 'beta_forecast_calibration',
    'beta_daily_engagement_30d'
  )
order by table_name;

-- 6. RLS enabled?
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = (select oid from pg_namespace where nspname = 'public')
  and relkind = 'r'
order by relname;
