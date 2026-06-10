-- Harden AI quota reservation against concurrent requests for the same user + feature.
-- The previous implementation counted then inserted without a lock, so parallel
-- calls could all observe the same usage count and exceed the configured limit.

create or replace function public.reserve_ai_usage_event(
  p_request_id uuid,
  p_user_id uuid,
  p_feature text,
  p_plan_tier text,
  p_provider text,
  p_model text,
  p_daily_limit integer,
  p_monthly_limit integer,
  p_estimated_cost_usd numeric
) returns setof public.ai_usage_events
language plpgsql
security definer
as $$
declare
  v_daily_used integer;
  v_monthly_used integer;
  v_status text := 'reserved';
  v_quota_window text := null;
  v_daily_reset timestamptz := date_trunc('day', now()) + interval '1 day';
  v_monthly_reset timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  -- Serialize quota checks for the same user + feature within this transaction.
  -- This keeps the count + insert operation atomic without blocking unrelated users/features.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_feature));

  select count(*) into v_daily_used
  from public.ai_usage_events
  where user_id = p_user_id
    and feature = p_feature
    and status in ('reserved', 'success', 'failed', 'fallback')
    and created_at >= date_trunc('day', now());

  select count(*) into v_monthly_used
  from public.ai_usage_events
  where user_id = p_user_id
    and feature = p_feature
    and status in ('reserved', 'success', 'failed', 'fallback')
    and created_at >= date_trunc('month', now());

  if p_daily_limit is not null and p_daily_limit >= 0 and v_daily_used >= p_daily_limit then
    v_status := 'blocked';
    v_quota_window := 'daily';
  elsif p_monthly_limit is not null and p_monthly_limit >= 0 and v_monthly_used >= p_monthly_limit then
    v_status := 'blocked';
    v_quota_window := 'monthly';
  end if;

  return query
  with inserted as (
    insert into public.ai_usage_events (
      request_id,
      user_id,
      feature,
      plan_tier,
      provider,
      model,
      status,
      cache_hit,
      estimated_cost_usd,
      created_at
    ) values (
      p_request_id,
      p_user_id,
      p_feature,
      p_plan_tier,
      p_provider,
      p_model,
      v_status,
      false,
      coalesce(p_estimated_cost_usd, 0),
      now()
    )
    returning *
  )
  select
    inserted.*
  from inserted;
end;
$$;

comment on function public.reserve_ai_usage_event is
  'Atomically reserves an AI usage slot per user/feature using pg_advisory_xact_lock to prevent quota races.';
