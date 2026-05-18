# Supabase Schema Gap Checklist

This checklist reflects the current Supabase project state shown in the dashboard and the repository migrations.

## Current Project State

The current Supabase project currently shows only these public tables in the UI:

- `activity_logs`
- `food_logs`
- `foods`
- `saved_meals`
- `users`

That means the database is **not yet fully migrated** to match the repository schema.

## Missing Tables / Objects

The following tables exist in the repository migrations but are not visible in the current Supabase project table list:

- `reminder_preferences` — migration: `supabase/migrations/005_reminders.sql`
- `correction_events` — migration: `supabase/migrations/004_corrections.sql`
- `user_subscriptions` — migration: `supabase/migrations/006_subscriptions.sql`
- `user_context_events` — migration: `supabase/migrations/011_user_context_events.sql`
- `logging_events` — migration: `supabase/migrations/010_logging_events.sql`
- `push_notification_tokens` — migration: `supabase/migrations/009_push_tokens.sql`
- `user_behavioral_patterns` — migration: `supabase/migrations/012_coach_insights.sql`
- `user_coaching_insights` — migration: `supabase/migrations/012_coach_insights.sql`
- `user_coaching_summaries` — migration: `supabase/migrations/012_coach_insights.sql`
- `body_progress` — migration: `supabase/migrations/013_body_progress.sql`
- `user_daily_roadmap` — migration: `supabase/migrations/014_user_daily_roadmap.sql`
- `users.health_flags` column/constraint — migration: `supabase/migrations/015_user_health_flags.sql`
- `foods.saturated_fat_g`, quality nutrient columns on `food_logs`, and saved-meal quality totals — migration: `supabase/migrations/016_food_quality_nutrients.sql`
- `users.goal_plan` JSONB column/constraint — migration: `supabase/migrations/017_add_goal_plan_to_users.sql`
- `user_activity_preferences` — migration: `supabase/migrations/018_user_activity_preferences.sql`

## Existing Tables Already Present

- `users` — migration: `supabase/migrations/001_users.sql`
- `foods` — migration: `supabase/migrations/002_foods.sql`
- `food_logs` — migration: `supabase/migrations/003_logs.sql`
- `saved_meals` — migration: `supabase/migrations/004_saved_meals.sql`
- `activity_logs` — migration: `supabase/migrations/006_activities.sql` + `supabase/migrations/007_activity_sync.sql`

## Impacted Features

If the missing tables are not migrated, the following features are incomplete or will fail at runtime:

- Reminder preferences and push scheduling
- Correction telemetry
- Login / scan funnel analytics
- Subscription tier storage
- Activity sync metadata
- Behavioral coaching summaries and insights
- Body progress tracking
- Profile health guardrails and medical-review warnings
- Today quality nutrient tracking for fiber, sodium, total sugar, and saturated fat
- Backend-clamped personal goal plans
- Profile activity preferences, Today movement recommendations, and Log quick completion from the user's preferred activities

## Recommended Migration Order

Run in this order to minimize dependency issues:

1. `001_users.sql`
2. `002_foods.sql`
3. `003_logs.sql`
4. `004_saved_meals.sql`
5. `004_corrections.sql`
6. `005_per_meal_targets.sql`
7. `005_reminders.sql`
8. `006_activities.sql`
9. `006_subscriptions.sql`
10. `007_activity_sync.sql`
11. `008_food_canonical.sql`
12. `009_push_tokens.sql`
13. `010_logging_events.sql`
14. `011_user_context_events.sql`
15. `012_coach_insights.sql`
16. `013_body_progress.sql`
17. `014_user_daily_roadmap.sql`
18. `015_user_health_flags.sql`
19. `016_food_quality_nutrients.sql`
20. `017_add_goal_plan_to_users.sql`
21. `018_user_activity_preferences.sql`

## Verification Steps After Migration

- Confirm the Supabase table list and `users` columns match the repository migrations.
- Confirm RLS policies exist for user-owned data.
- Confirm the backend health endpoint still passes DB checks.
- Run backend tests against the migrated database.

## Notes

- The repository already contains the migration files; the missing step is applying them to this Supabase project.
- If the project was created from a partial SQL import or if migrations were never run, this is a schema drift issue rather than a code issue.
