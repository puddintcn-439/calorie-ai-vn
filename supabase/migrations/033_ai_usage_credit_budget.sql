-- AI credit budget v2.
-- Adds weighted credits on top of existing per-feature request quotas.
-- This lets production pricing control worst-case cost across mixed AI features:
-- text/coach/refine = 1 credit, voice = 2, image = 3, receipt = 5.

alter table public.ai_usage_events
  add column if not exists credits_consumed integer not null default 1;

create index if not exists ai_usage_events_user_feature_status_created_idx
  on public.ai_usage_events(user_id, feature, status, created_at desc);

create index if not exists ai_usage_events_user_status_created_idx
  on public.ai_usage_events(user_id, status, created_at desc);

create or replace function public.reserve_ai_usage_event(
  p_request_id uuid,
  p_user_id uuid,
  p_feature text,
  p_plan_tier text,
  p_provider text,
  p_model text,
  p_daily_limit integer,
  p_monthly_limit integer,
  p_estimated_cost_usd numeric,
  p_credit_cost integer default 1,
  p_daily_credit_limit integer default null,
  p_monthly_credit_limit integer default null
) returns setof public.ai_usage_events
language plpgsql
security definer
as $$
declare
  v_daily_used integer;
  v_monthly_used integer;
  v_daily_credits_used integer;
  v_monthly_credits_used integer;
  v_credit_cost integer := greatest(coalesce(p_credit_cost, 1), 1);
  v_status text := 'reserved';
begin
  -- Serialize quota checks for the same user. Credit budget is cross-feature,
  -- so locking only by user prevents text+image+receipt races from exceeding credits.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

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

  select coalesce(sum(credits_consumed), 0) into v_daily_credits_used
  from public.ai_usage_events
  where user_id = p_user_id
    and status in ('reserved', 'success', 'failed', 'fallback')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(credits_consumed), 0) into v_monthly_credits_used
  from public.ai_usage_events
  where user_id = p_user_id
    and status in ('reserved', 'success', 'failed', 'fallback')
    and created_at >= date_trunc('month', now());

  if (p_daily_limit is not null and p_daily_limit >= 0 and v_daily_used >= p_daily_limit)
     or (p_monthly_limit is not null and p_monthly_limit >= 0 and v_monthly_used >= p_monthly_limit)
     or (p_daily_credit_limit is not null and p_daily_credit_limit >= 0 and v_daily_credits_used + v_credit_cost > p_daily_credit_limit)
     or (p_monthly_credit_limit is not null and p_monthly_credit_limit >= 0 and v_monthly_credits_used + v_credit_cost > p_monthly_credit_limit) then
    v_status := 'blocked';
  end if;

  return query
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
    credits_consumed,
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
    v_credit_cost,
    now()
  )
  returning *;
end;
$$;

create or replace function public.finalize_ai_usage_event(
  p_usage_event_id uuid,
  p_status text,
  p_cache_hit boolean default false,
  p_provider text default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_usd numeric default null,
  p_error_category text default null,
  p_error_message text default null,
  p_credits_consumed integer default null
) returns public.ai_usage_events
language plpgsql
security definer
as $$
declare
  v_row public.ai_usage_events;
begin
  update public.ai_usage_events
  set
    status = p_status,
    cache_hit = coalesce(p_cache_hit, false),
    provider = coalesce(p_provider, provider),
    model = coalesce(p_model, model),
    input_tokens = coalesce(p_input_tokens, input_tokens),
    output_tokens = coalesce(p_output_tokens, output_tokens),
    estimated_cost_usd = coalesce(p_estimated_cost_usd, estimated_cost_usd),
    credits_consumed = greatest(coalesce(p_credits_consumed, credits_consumed), 0),
    error_category = coalesce(p_error_category, error_category),
    error_message = coalesce(p_error_message, error_message),
    completed_at = now()
  where id = p_usage_event_id
  returning * into v_row;

  return v_row;
end;
$$;
