-- Beta measurement kit: forecast snapshots and SQL analytics for behavior-engine validation.

create table if not exists public.behavior_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_date date not null,
  source text not null default 'today' check (source in ('today', 'coach')),
  forecast_score integer not null check (forecast_score between 0 and 100),
  forecast_label text not null,
  risk_level text not null,
  confidence text not null,
  health_score_overall integer,
  adherence_score integer,
  weakest_area text,
  forecast jsonb not null default '{}'::jsonb,
  health_score jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, source)
);

alter table public.behavior_forecast_snapshots enable row level security;

drop policy if exists "Users manage own forecast snapshots" on public.behavior_forecast_snapshots;
create policy "Users manage own forecast snapshots"
  on public.behavior_forecast_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access on forecast snapshots" on public.behavior_forecast_snapshots;
create policy "Service role full access on forecast snapshots"
  on public.behavior_forecast_snapshots
  for all
  using (auth.role() = 'service_role');

create index if not exists behavior_forecast_snapshots_user_date_idx
  on public.behavior_forecast_snapshots(user_id, local_date desc);

create index if not exists behavior_forecast_snapshots_created_idx
  on public.behavior_forecast_snapshots(created_at desc);

create or replace function public.set_behavior_forecast_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists behavior_forecast_snapshots_updated_at on public.behavior_forecast_snapshots;
create trigger behavior_forecast_snapshots_updated_at
  before update on public.behavior_forecast_snapshots
  for each row execute function public.set_behavior_forecast_snapshot_updated_at();

create or replace view public.beta_intervention_performance_30d as
select
  user_id,
  intervention_type,
  mode,
  primary_action,
  count(*) filter (where event_type = 'shown')::integer as shown,
  count(*) filter (where event_type = 'acted')::integer as acted,
  count(*) filter (where event_type = 'dismissed')::integer as dismissed,
  case
    when count(*) filter (where event_type = 'shown') = 0 then 0
    else round((count(*) filter (where event_type = 'acted'))::numeric * 100 / nullif(count(*) filter (where event_type = 'shown'), 0))::integer
  end as action_rate,
  case
    when count(*) filter (where event_type = 'shown') = 0 then 0
    else round((count(*) filter (where event_type = 'dismissed'))::numeric * 100 / nullif(count(*) filter (where event_type = 'shown'), 0))::integer
  end as dismiss_rate,
  case
    when count(*) filter (where event_type = 'shown') >= 20 then 'ready'
    when count(*) filter (where event_type = 'shown') > 0 then 'learning'
    else 'insufficient'
  end as sample_status
from public.user_intervention_events
where created_at >= now() - interval '30 days'
group by user_id, intervention_type, mode, primary_action;

alter view public.beta_intervention_performance_30d set (security_invoker = true);

create or replace view public.beta_reminder_fatigue_weekly as
with weekly as (
  select
    user_id,
    date_trunc('week', local_date::timestamp)::date as week_start,
    count(*)::integer as sent,
    count(opened_at)::integer as opened,
    count(acted_at)::integer as acted,
    (count(*) - count(opened_at))::integer as ignored,
    case when count(*) = 0 then 0 else round(count(opened_at)::numeric * 100 / count(*))::integer end as open_rate,
    case when count(*) = 0 then 0 else round(count(acted_at)::numeric * 100 / count(*))::integer end as action_rate
  from public.reminder_notification_log
  where sent_at >= now() - interval '90 days'
  group by user_id, date_trunc('week', local_date::timestamp)::date
),
with_prev as (
  select
    weekly.*,
    lag(open_rate) over (partition by user_id order by week_start) as previous_open_rate
  from weekly
)
select
  *,
  case
    when previous_open_rate is null then false
    when previous_open_rate - open_rate >= 25 then true
    else false
  end as fatigue_flag
from with_prev;

alter view public.beta_reminder_fatigue_weekly set (security_invoker = true);

create or replace view public.beta_forecast_accuracy_weekly as
with actuals as (
  select
    user_id,
    week_start,
    sum(food_logged)::integer as food_days,
    sum(activity_logged)::integer as activity_days,
    sum(roadmap_total)::integer as roadmap_total,
    sum(roadmap_completed)::integer as roadmap_completed
  from (
    select
      user_id,
      date_trunc('week', logged_day::timestamp)::date as week_start,
      max(food_logged)::integer as food_logged,
      max(activity_logged)::integer as activity_logged,
      max(roadmap_total)::integer as roadmap_total,
      max(roadmap_completed)::integer as roadmap_completed
    from (
      select user_id, logged_at::date as logged_day, 1 as food_logged, 0 as activity_logged, 0 as roadmap_total, 0 as roadmap_completed
      from public.food_logs
      where logged_at >= now() - interval '120 days'
      union all
      select user_id, logged_at::date as logged_day, 0, 1, 0, 0
      from public.activity_logs
      where logged_at >= now() - interval '120 days'
      union all
      select user_id, logged_date as logged_day, 0, 0, count(*)::integer, count(*) filter (where is_completed = true)::integer
      from public.user_daily_roadmap
      where logged_date >= current_date - 120
      group by user_id, logged_date
    ) daily_signals
    group by user_id, logged_day
  ) daily
  group by user_id, week_start
),
scored as (
  select
    user_id,
    week_start,
    food_days,
    activity_days,
    roadmap_total,
    roadmap_completed,
    round(
      least(food_days::numeric / 5, 1) * 45
      + least(activity_days::numeric / 3, 1) * 35
      + case
          when roadmap_total > 0 then least(roadmap_completed::numeric / roadmap_total, 1) * 20
          else 0
        end
    )::integer as actual_adherence_score
  from actuals
)
select
  snapshots.id as snapshot_id,
  snapshots.user_id,
  snapshots.local_date,
  date_trunc('week', snapshots.local_date::timestamp)::date as week_start,
  snapshots.source,
  snapshots.forecast_score,
  snapshots.forecast_label,
  snapshots.risk_level,
  snapshots.confidence,
  snapshots.health_score_overall,
  snapshots.adherence_score as predicted_adherence_score,
  coalesce(scored.actual_adherence_score, 0) as actual_adherence_score,
  coalesce(scored.food_days, 0) as food_days,
  coalesce(scored.activity_days, 0) as activity_days,
  coalesce(scored.roadmap_total, 0) as roadmap_total,
  coalesce(scored.roadmap_completed, 0) as roadmap_completed,
  abs(snapshots.forecast_score - coalesce(scored.actual_adherence_score, 0)) as absolute_error,
  (snapshots.forecast_score >= 70) as predicted_success,
  (coalesce(scored.actual_adherence_score, 0) >= 70) as actual_success
from public.behavior_forecast_snapshots snapshots
left join scored
  on scored.user_id = snapshots.user_id
 and scored.week_start = date_trunc('week', snapshots.local_date::timestamp)::date;

alter view public.beta_forecast_accuracy_weekly set (security_invoker = true);

create or replace view public.beta_daily_engagement_30d as
with days as (
  select
    users.id as user_id,
    series.day::date as local_date
  from public.users
  cross join generate_series(current_date - 29, current_date, interval '1 day') as series(day)
)
select
  days.user_id,
  days.local_date,
  count(distinct food_logs.id)::integer as food_logs,
  count(distinct activity_logs.id)::integer as activity_logs,
  count(distinct roadmap.id)::integer as roadmap_tasks,
  count(distinct roadmap.id) filter (where roadmap.is_completed = true)::integer as roadmap_completed,
  count(distinct reminders.id)::integer as reminders_sent,
  count(distinct reminders.id) filter (where reminders.opened_at is not null)::integer as reminders_opened,
  count(distinct reminders.id) filter (where reminders.acted_at is not null)::integer as reminders_acted,
  count(distinct interventions.id) filter (where interventions.event_type = 'shown')::integer as interventions_shown,
  count(distinct interventions.id) filter (where interventions.event_type = 'acted')::integer as interventions_acted,
  count(distinct snapshots.id)::integer as forecast_snapshots
from days
left join public.food_logs
  on food_logs.user_id = days.user_id
 and food_logs.logged_at::date = days.local_date
left join public.activity_logs
  on activity_logs.user_id = days.user_id
 and activity_logs.logged_at::date = days.local_date
left join public.user_daily_roadmap roadmap
  on roadmap.user_id = days.user_id
 and roadmap.logged_date = days.local_date
left join public.reminder_notification_log reminders
  on reminders.user_id = days.user_id
 and reminders.local_date = days.local_date
left join public.user_intervention_events interventions
  on interventions.user_id = days.user_id
 and interventions.created_at::date = days.local_date
left join public.behavior_forecast_snapshots snapshots
  on snapshots.user_id = days.user_id
 and snapshots.local_date = days.local_date
group by days.user_id, days.local_date;

alter view public.beta_daily_engagement_30d set (security_invoker = true);
