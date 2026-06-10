create table if not exists public.ai_usage_events (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  feature text not null,
  plan_tier text not null,
  provider text,
  model text,
  status text not null default 'reserved' check (status in ('reserved', 'success', 'failed', 'fallback', 'blocked')),
  cache_hit boolean not null default false,
  estimated_cost_usd numeric(12,6) not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_category text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index if not exists ai_usage_events_feature_created_idx on public.ai_usage_events(feature, created_at desc);
create index if not exists ai_usage_events_status_idx on public.ai_usage_events(status);
create index if not exists ai_usage_events_provider_idx on public.ai_usage_events(provider);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can view own AI usage" on public.ai_usage_events;
create policy "Users can view own AI usage"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on AI usage" on public.ai_usage_events;
create policy "Service role full access on AI usage"
  on public.ai_usage_events for all
  using (auth.role() = 'service_role');

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
begin
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

  if (p_daily_limit is not null and p_daily_limit >= 0 and v_daily_used >= p_daily_limit)
     or (p_monthly_limit is not null and p_monthly_limit >= 0 and v_monthly_used >= p_monthly_limit) then
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
  p_error_message text default null
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
    error_category = coalesce(p_error_category, error_category),
    error_message = coalesce(p_error_message, error_message),
    completed_at = now()
  where id = p_usage_event_id
  returning * into v_row;

  return v_row;
end;
$$;