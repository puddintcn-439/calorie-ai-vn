-- Normalize overlap between users.subscription_tier, legacy user_subscriptions,
-- and the billing subscription ledger.
--
-- Rules:
-- - billing_subscriptions is the paid billing source of truth.
-- - user_subscriptions is a legacy/current-access bridge.
-- - users.subscription_tier is a denormalized cache only.
-- - cancelled legacy rows must not be interpreted as active paid access.

alter table public.user_subscriptions
  alter column renews_at drop not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'user_subscriptions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%payment_provider%'
  loop
    execute format('alter table public.user_subscriptions drop constraint %I', constraint_name);
  end loop;

  alter table public.user_subscriptions
    drop constraint if exists user_subscriptions_payment_provider_check;

  alter table public.user_subscriptions
    add constraint user_subscriptions_payment_provider_check
    check (
      payment_provider is null
      or payment_provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial', 'in_app')
    );
end $$;

-- A cancelled legacy row can remain for support/reporting, but it is not active access.
update public.user_subscriptions us
set
  is_active = false,
  updated_at = now()
where us.cancelled_at is not null
  and us.is_active is distinct from false
  and not exists (
    select 1
    from public.billing_subscriptions bs
    where bs.user_id = us.user_id
      and bs.is_paid = true
      and lower(bs.status) = 'active'
      and bs.cancelled_at is null
      and bs.tier in ('premium', 'pro')
      and (bs.billing_period_end is null or bs.billing_period_end > now())
  );

-- Mirror the strongest active paid billing entitlement into the legacy bridge.
with active_paid_billing as (
  select
    bs.user_id,
    bs.tier,
    bs.provider,
    bs.billing_period_start,
    bs.billing_period_end,
    row_number() over (
      partition by bs.user_id
      order by
        case bs.tier when 'pro' then 2 when 'premium' then 1 else 0 end desc,
        bs.billing_period_end desc nulls first,
        bs.updated_at desc nulls last,
        bs.created_at desc nulls last
    ) as row_number
  from public.billing_subscriptions bs
  join public.users u on u.id = bs.user_id
  where bs.is_paid = true
    and lower(bs.status) = 'active'
    and bs.cancelled_at is null
    and bs.tier in ('premium', 'pro')
    and (bs.billing_period_end is null or bs.billing_period_end > now())
)
insert into public.user_subscriptions (
  user_id,
  tier,
  is_active,
  payment_provider,
  started_at,
  renews_at,
  cancelled_at,
  updated_at
)
select
  user_id,
  tier,
  true,
  provider,
  coalesce(billing_period_start, now()),
  billing_period_end,
  null,
  now()
from active_paid_billing
where row_number = 1
on conflict (user_id) do update
set
  tier = excluded.tier,
  is_active = true,
  payment_provider = excluded.payment_provider,
  started_at = coalesce(public.user_subscriptions.started_at, excluded.started_at),
  renews_at = excluded.renews_at,
  cancelled_at = null,
  updated_at = now();

-- Rebuild users.subscription_tier from current active access. Missing or cancelled rows are free.
with current_access as (
  select distinct on (us.user_id)
    us.user_id,
    us.tier
  from public.user_subscriptions us
  where us.tier in ('premium', 'pro')
    and us.is_active = true
    and us.cancelled_at is null
    and (us.renews_at is null or us.renews_at > now())
  order by
    us.user_id,
    case us.tier when 'pro' then 2 when 'premium' then 1 else 0 end desc,
    us.updated_at desc nulls last,
    us.created_at desc nulls last
),
resolved_users as (
  select
    u.id,
    coalesce(ca.tier, 'free') as current_tier
  from public.users u
  left join current_access ca on ca.user_id = u.id
)
update public.users u
set
  subscription_tier = resolved_users.current_tier,
  updated_at = now()
from resolved_users
where resolved_users.id = u.id
  and u.subscription_tier is distinct from resolved_users.current_tier;
