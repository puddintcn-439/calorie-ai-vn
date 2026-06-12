-- Billing & Revenue Dashboard V4 foundation
-- Stores provider-confirmed billing data separately from estimated subscription tier data.

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'app_store', 'google_play', 'manual', 'trial')),
  provider_customer_id text,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  provider text not null check (provider in ('stripe', 'app_store', 'google_play', 'manual', 'trial')),
  provider_subscription_id text,
  tier text not null check (tier in ('free', 'premium', 'pro')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'refunded')),
  is_paid boolean not null default false,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  billing_subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider text not null check (provider in ('stripe', 'app_store', 'google_play', 'manual', 'trial')),
  provider_invoice_id text,
  tier text not null check (tier in ('free', 'premium', 'pro')),
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible', 'refunded')),
  amount_original numeric(12, 4) not null default 0,
  currency_original text not null default 'VND',
  amount_vnd numeric(14, 2) not null default 0,
  amount_usd numeric(14, 4) not null default 0,
  fx_rate numeric(14, 4) not null default 26000,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  billing_invoice_id uuid references public.billing_invoices(id) on delete set null,
  provider text not null check (provider in ('stripe', 'app_store', 'google_play', 'manual', 'trial')),
  provider_refund_id text,
  amount_original numeric(12, 4) not null default 0,
  currency_original text not null default 'VND',
  amount_vnd numeric(14, 2) not null default 0,
  amount_usd numeric(14, 4) not null default 0,
  fx_rate numeric(14, 4) not null default 26000,
  refunded_at timestamptz not null default now(),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_refund_id)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'app_store', 'google_play', 'manual', 'trial')),
  provider_event_id text not null,
  event_type text not null,
  user_id uuid references public.users(id) on delete set null,
  billing_subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  billing_invoice_id uuid references public.billing_invoices(id) on delete set null,
  billing_refund_id uuid references public.billing_refunds(id) on delete set null,
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_billing_customers_user_id on public.billing_customers(user_id);
create index if not exists idx_billing_subscriptions_user_id on public.billing_subscriptions(user_id);
create index if not exists idx_billing_subscriptions_status_paid on public.billing_subscriptions(status, is_paid);
create index if not exists idx_billing_invoices_user_id on public.billing_invoices(user_id);
create index if not exists idx_billing_invoices_paid_at on public.billing_invoices(paid_at);
create index if not exists idx_billing_refunds_user_id on public.billing_refunds(user_id);
create index if not exists idx_billing_refunds_refunded_at on public.billing_refunds(refunded_at);
create index if not exists idx_billing_events_provider_event on public.billing_events(provider, provider_event_id);
create index if not exists idx_billing_events_status_created_at on public.billing_events(status, created_at);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_events enable row level security;
