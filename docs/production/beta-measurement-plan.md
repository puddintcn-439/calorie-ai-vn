# Beta Measurement Plan

Purpose: validate the Behavior Engine without building more product surface area. This plan works for dogfooding, synthetic QA, and small private beta. It does not prove product-market fit, but it prevents blind optimization.

## What Is Now Measured

The app records `behavior_forecast_snapshots` from Today and Coach when Success Forecast is available.

Supabase migration `021_beta_measurement_kit.sql` adds:

- `behavior_forecast_snapshots`
- `beta_forecast_accuracy_weekly`
- `beta_intervention_performance_30d`
- `beta_reminder_fatigue_weekly`
- `beta_daily_engagement_30d`

Supabase migration `022_forecast_calibration.sql` adds:

- `beta_forecast_calibration`

Dev/staging sample data is available at `supabase/dev/seed_beta_measurement_sample.sql`. Run it only outside production, after at least one test user exists.

## Core Questions

1. Do users keep logging?
2. Does Success Forecast match actual weekly adherence?
3. Which interventions get action, dismiss, or no response?
4. Are reminders losing effectiveness over time?
5. Is there enough sample size to trust adaptive ranking?

## Decision Gates

Do not build Adaptive Intervention Engine v2 until these minimums are met:

- `>= 20` shown events for a specific intervention type before trusting its ranking.
- `>= 100` forecast snapshots with completed outcome weeks before tuning forecast weights.
- `>= 100` calibration samples and weighted calibration error `<= 10-15` before using forecast probability to automate intervention ranking.
- `>= 4` active weeks of reminder data before declaring reminder fatigue.
- `>= 10` dogfood/beta users with at least `7` active days before evaluating retention.

## SQL Checks

Top effective and ignored interventions:

```sql
select *
from public.beta_intervention_performance_30d
order by sample_status desc, action_rate desc, shown desc;
```

Forecast calibration:

```sql
select *
from public.beta_forecast_calibration
order by bucket_order;
```

Forecast accuracy:

```sql
select
  count(*) as snapshots,
  round(avg(absolute_error), 1) as avg_absolute_error,
  round(avg(case when predicted_success = actual_success then 1 else 0 end) * 100, 1) as classification_accuracy,
  round(avg(forecast_score), 1) as avg_forecast_score,
  round(avg(actual_adherence_score), 1) as avg_actual_adherence
from public.beta_forecast_accuracy_weekly
where local_date <= current_date - 7;
```

High-risk forecast misses:

```sql
select *
from public.beta_forecast_accuracy_weekly
where local_date <= current_date - 7
  and forecast_score >= 70
  and actual_adherence_score < 50
order by absolute_error desc;
```

Reminder fatigue:

```sql
select *
from public.beta_reminder_fatigue_weekly
where fatigue_flag = true
order by week_start desc;
```

Daily engagement:

```sql
select
  local_date,
  count(*) filter (where food_logs > 0 or activity_logs > 0 or roadmap_completed > 0) as active_users,
  round(avg(food_logs), 2) as avg_food_logs,
  round(avg(activity_logs), 2) as avg_activity_logs,
  round(avg(interventions_acted), 2) as avg_interventions_acted
from public.beta_daily_engagement_30d
group by local_date
order by local_date desc;
```

## No-User Validation Workflow

Use this when there are no external beta users yet:

1. Dogfood with 2-3 internal accounts for 14 days.
2. Each account should intentionally follow a different pattern:
   - consistent logger
   - inconsistent logger
   - ignores reminders
   - acts on movement nudges
3. Confirm each SQL view returns non-empty, plausible rows.
4. Confirm `sample_status` stays `learning` until enough events exist.
5. Do not tune weights from dogfood data. Only use it to validate instrumentation.

For a pure pipeline smoke test, run:

```sql
-- Supabase SQL editor on local/staging only
\i supabase/dev/seed_beta_measurement_sample.sql
```

If your SQL editor does not support `\i`, paste the file contents directly.

## When To Tune

Tune forecast weights only if:

- average absolute forecast error is consistently `> 20`
- there are at least `100` completed weekly snapshot outcomes
- the same driver is repeatedly wrong, such as high forecast despite low logging/activity

Tune intervention copy/timing if:

- dismiss rate is `>= 30%` with at least `20` shown events
- action rate is `< 15%` with at least `20` shown events
- reminder fatigue appears for 2 consecutive weeks

## What Not To Do Yet

- Do not enable full adaptive ranking from samples under threshold.
- Do not add Gym/Trainer Portal to solve a data problem.
- Do not treat dogfood data as product validation.
- Do not optimize for more reminders; optimize for fewer, better-timed actions.
