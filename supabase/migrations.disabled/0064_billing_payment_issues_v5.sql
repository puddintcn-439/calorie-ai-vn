-- Billing V5.4: payment issue and refund support case foundation.
-- This records support cases only. It does not call provider refund APIs or mutate entitlements.

create table if not exists public.billing_payment_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider text not null default 'payos',
  issue_type text not null check (issue_type in (
    'refund_request',
    'duplicate_payment',
    'payment_succeeded_but_not_activated',
    'wrong_plan',
    'other'
  )),
  status text not null default 'open' check (status in (
    'open',
    'in_review',
    'resolved',
    'rejected'
  )),
  user_message text,
  admin_note text,
  resolution text,
  created_by_user_id uuid references public.users(id) on delete set null,
  resolved_by_admin_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_billing_payment_issues_user_id
  on public.billing_payment_issues(user_id);

create index if not exists idx_billing_payment_issues_invoice_id
  on public.billing_payment_issues(invoice_id);

create index if not exists idx_billing_payment_issues_status
  on public.billing_payment_issues(status);

create index if not exists idx_billing_payment_issues_provider
  on public.billing_payment_issues(provider);

create index if not exists idx_billing_payment_issues_created_at
  on public.billing_payment_issues(created_at desc);

alter table public.billing_payment_issues enable row level security;
