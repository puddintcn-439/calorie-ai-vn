-- ==========================================
-- USER SUBSCRIPTIONS TABLE
-- ==========================================
-- Tracks user subscription tier and status
alter table public.users add column if not exists subscription_tier text default 'free' check (subscription_tier in ('free','premium','pro'));

create table if not exists public.user_subscriptions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  tier              text not null check (tier in ('free','premium','pro')) default 'free',
  started_at        timestamptz not null default now(),
  renews_at         timestamptz not null default (now() + interval '1 month'),
  cancelled_at      timestamptz,
  is_active         boolean not null default true,
  payment_provider  text check (payment_provider in ('stripe','in_app','trial')),
  payment_id        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists user_subscriptions_user_idx on public.user_subscriptions(user_id);
create index if not exists user_subscriptions_tier_idx on public.user_subscriptions(tier);
create index if not exists user_subscriptions_active_idx on public.user_subscriptions(is_active);
create index if not exists user_subscriptions_renews_idx on public.user_subscriptions(renews_at);

-- RLS: users see only their own subscription
alter table public.user_subscriptions enable row level security;

drop policy if exists "Users view own subscription" on public.user_subscriptions;
create policy "Users view own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access on subscriptions" on public.user_subscriptions;
create policy "Service role full access on subscriptions"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role');