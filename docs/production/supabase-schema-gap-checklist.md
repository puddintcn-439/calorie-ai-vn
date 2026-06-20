# Supabase Schema Audit Checklist

Updated: 2026-06-21

This document describes how to audit schema drift safely. It does not claim to know the current live Supabase table list; that must be verified against the target project at deployment time.

## Repository migration layout

- `supabase/migrations/` contains reviewed incremental migrations currently tracked for production evolution (`017` and newer).
- `supabase/migrations.disabled/` contains baseline, legacy, seed-heavy, or optional migrations. Files in this directory are not automatically applied.
- `npm run db:bootstrap:smoke` creates only the minimal schema needed by disposable CI/local smoke databases. Never use it as a production migration command.
- Docker Compose starts a clean PostgreSQL service and does not mount repository SQL into `/docker-entrypoint-initdb.d`.

## Pre-deployment audit

1. Export or inspect the target Supabase schema.
2. Confirm a restorable backup exists.
3. Compare required tables, columns, indexes, constraints, functions, triggers, and RLS policies with the reviewed SQL.
4. Select only migrations missing from the target environment.
5. Review dependencies such as `public.users`, Supabase `auth` functions, and extensions before execution.
6. Apply migrations in a transaction where supported.
7. Record the migration names, execution time, operator, and rollback plan.

## Core feature objects to verify

- Identity/profile: `users`, profile target and goal-plan columns.
- Nutrition: `foods`, `food_logs`, `saved_meals`, quality nutrient columns.
- Activity: `activity_logs`, sync metadata, `user_activity_preferences`, `user_daily_roadmap`.
- Coaching: insights, summaries, behavioral patterns, intervention memory.
- Reminders: `reminder_preferences`, push tokens, reminder feedback and notification log.
- Product telemetry: logging/correction events, forecast snapshots and calibration.
- Billing/admin: subscriptions, billing ledger, payment issues, admin roles, audit log, and quota adjustments.
- AI operations: usage ledger, quota concurrency guards, and credit budgets.

## Active incremental migrations

Review `supabase/migrations/` in lexical order. At the time of this update it includes:

- `017_add_goal_plan_to_users.sql`
- `018_push_reminder_hardening.sql`
- `019_reminder_feedback_loop.sql`
- `020_intervention_memory.sql`
- `021_beta_measurement_kit.sql`
- `022_forecast_calibration.sql`
- `022_remove_scan_image_url_from_corrections.sql`
- `023_ai_usage_ledger.sql`
- `032_ai_usage_quota_concurrency_guard.sql`
- `033_ai_usage_credit_budget.sql`
- `034_admin_audit_log.sql`
- `035_admin_roles_rbac.sql`
- `036_admin_quota_adjustments.sql`
- `037_normalize_subscription_consistency.sql`

The duplicate `022` prefix means filename sorting alone is not sufficient evidence of deployment order. Check the target schema and migration history before applying either file.

## Baseline and optional migrations

Baseline files such as `001_users.sql`, food/log/activity tables, and several billing migrations currently live under `supabase/migrations.disabled/`. Their location is intentional: they may already exist in production or may require environment-specific review.

Do not move or batch-run these files merely to make a fresh local PostgreSQL instance initialize. CI uses the dedicated smoke bootstrap instead.

## Post-migration verification

- Backend `/health` reports a connected database.
- Backend type-check, unit tests, and smoke tests pass.
- RLS policies allow users to access only their own rows.
- Service-role operations still work.
- The mobile auth, logging, scan, reminders, coaching, and subscription flows pass against staging.
- No unexpected tables or columns were dropped.

## Rollback

- Prefer restoring from the pre-migration backup for destructive failures.
- For additive migrations, prepare explicit rollback SQL before deployment.
- Never rely on `npm run db:bootstrap:smoke` for rollback or production repair.
