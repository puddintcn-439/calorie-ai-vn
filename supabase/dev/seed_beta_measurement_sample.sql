-- Dev-only beta measurement sample data.
-- Run only on local/staging databases. Do not run on production.
-- Replace the demo user id/email if your users table requires a different shape.

do $$
declare
  demo_user_id uuid;
  day_offset integer;
  current_day date;
begin
  select id into demo_user_id from public.users order by created_at desc limit 1;

  if demo_user_id is null then
    raise exception 'No public.users row found. Create or sign in with a test account before running this dev seed.';
  end if;

  delete from public.user_intervention_events
  where user_id = demo_user_id
    and source = 'today'
    and intervention_type in ('activity_recovery', 'reminder_tuning')
    and created_at >= current_date - 35;

  delete from public.behavior_forecast_snapshots
  where user_id = demo_user_id
    and local_date >= current_date - 35
    and source = 'today';

  delete from public.reminder_notification_log
  where user_id = demo_user_id
    and token = 'demo-token'
    and local_date >= current_date - 35;

  delete from public.user_daily_roadmap
  where user_id = demo_user_id
    and task_id like 'demo-walk-%'
    and logged_date >= current_date - 35;

  delete from public.activity_logs
  where user_id = demo_user_id
    and activity_name = 'Demo walk'
    and logged_at >= current_date - 35;

  delete from public.food_logs
  where user_id = demo_user_id
    and name in ('Demo breakfast', 'Demo dinner')
    and logged_at >= current_date - 35;

  for day_offset in 0..20 loop
    current_day := current_date - day_offset;

    insert into public.food_logs (
      user_id, meal_type, logged_at, quantity, unit, estimated_grams,
      calories, protein_g, carbs_g, fat_g, name, source
    )
    values
      (demo_user_id, 'breakfast', current_day + time '08:00', 1, 'serving', 220, 420, 28, 45, 12, 'Demo breakfast', 'manual_entry'),
      (demo_user_id, 'dinner', current_day + time '19:00', 1, 'serving', 360, 680, 42, 70, 20, 'Demo dinner', 'manual_entry')
    on conflict do nothing;

    if day_offset % 2 = 0 then
      insert into public.activity_logs (user_id, activity_type, activity_name, duration_min, calories_burned, logged_at)
      values (demo_user_id, 'walking', 'Demo walk', 20, 80, current_day + time '18:00')
      on conflict do nothing;
    end if;

    insert into public.user_daily_roadmap (
      user_id, logged_date, task_id, task_title, activity_type, duration_min, estimated_kcal, is_completed
    )
    values (
      demo_user_id,
      current_day,
      'demo-walk-' || current_day::text,
      'Demo walk',
      'walking',
      20,
      80,
      day_offset % 3 <> 0
    )
    on conflict do nothing;

    insert into public.reminder_notification_log (
      user_id, token, meal_type, local_date, sent_at, opened_at, acted_at, acted_action_type
    )
    values (
      demo_user_id,
      'demo-token',
      'dinner',
      current_day,
      current_day + time '18:30',
      case when day_offset < 12 then current_day + time '18:32' else null end,
      case when day_offset < 7 then current_day + time '18:45' else null end,
      case when day_offset < 7 then 'food_log' else null end
    )
    on conflict (user_id, token, meal_type, local_date) do update
      set opened_at = excluded.opened_at,
          acted_at = excluded.acted_at,
          acted_action_type = excluded.acted_action_type;

    insert into public.behavior_forecast_snapshots (
      user_id, local_date, source, forecast_score, forecast_label, risk_level, confidence,
      health_score_overall, adherence_score, weakest_area, forecast, health_score
    )
    values (
      demo_user_id,
      current_day,
      'today',
      case when day_offset < 7 then 76 else 58 end,
      case when day_offset < 7 then 'on_track' else 'needs_attention' end,
      case when day_offset < 7 then 'medium' else 'high' end,
      'medium',
      case when day_offset < 7 then 78 else 61 end,
      case when day_offset < 7 then 74 else 56 end,
      case when day_offset % 2 = 0 then 'activity' else 'logging' end,
      jsonb_build_object('score', case when day_offset < 7 then 76 else 58 end),
      jsonb_build_object('overall', case when day_offset < 7 then 78 else 61 end)
    )
    on conflict (user_id, local_date, source) do update
      set forecast_score = excluded.forecast_score,
          forecast_label = excluded.forecast_label,
          risk_level = excluded.risk_level,
          confidence = excluded.confidence,
          health_score_overall = excluded.health_score_overall,
          adherence_score = excluded.adherence_score,
          weakest_area = excluded.weakest_area,
          forecast = excluded.forecast,
          health_score = excluded.health_score;
  end loop;

  for day_offset in 0..29 loop
    current_day := current_date - day_offset;

    insert into public.user_intervention_events (
      user_id, intervention_type, mode, priority, primary_action, event_type, source, forecast_score, created_at
    )
    values
      (demo_user_id, 'activity_recovery', 'recovery_plan', 'high', 'move', 'shown', 'today', 58, current_day + time '08:00'),
      (demo_user_id, 'activity_recovery', 'recovery_plan', 'high', 'move', case when day_offset % 3 <> 0 then 'acted' else 'dismissed' end, 'today', 58, current_day + time '08:10'),
      (demo_user_id, 'reminder_tuning', 'light_nudge', 'low', 'adjust_reminders', 'shown', 'today', 64, current_day + time '19:00'),
      (demo_user_id, 'reminder_tuning', 'light_nudge', 'low', 'adjust_reminders', case when day_offset % 4 = 0 then 'acted' else 'dismissed' end, 'today', 64, current_day + time '19:10');
  end loop;
end $$;

select * from public.beta_intervention_performance_30d order by shown desc limit 10;
select * from public.beta_forecast_accuracy_weekly order by local_date desc limit 10;
select * from public.beta_reminder_fatigue_weekly order by week_start desc limit 10;
