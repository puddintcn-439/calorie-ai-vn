-- Admin Console V2: AI quota adjustment foundation
-- Used by Safe Admin Actions to reset/adjust quota without mutating historical ai_usage_events.

create table if not exists public.admin_quota_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scope text not null check (scope in ('daily', 'monthly')),
  credits_delta integer not null,
  reason text not null,
  actor_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_quota_adjustments_user_scope_expires
  on public.admin_quota_adjustments (user_id, scope, expires_at desc);

create index if not exists idx_admin_quota_adjustments_actor_email
  on public.admin_quota_adjustments (lower(actor_email));

alter table public.admin_quota_adjustments enable row level security;

-- Service-role/backend access is expected.
-- No public policies are added intentionally.
