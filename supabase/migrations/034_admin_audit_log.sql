-- Admin Console V2: audit log foundation
-- Read-only V1 is complete; V2 write actions must write to this table.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id text null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);

create index if not exists idx_admin_audit_log_actor_email
  on public.admin_audit_log (lower(actor_email));

create index if not exists idx_admin_audit_log_action
  on public.admin_audit_log (action);

create index if not exists idx_admin_audit_log_target
  on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;

-- Service-role/backend access is expected for Admin Console operations.
-- No public RLS policies are added intentionally.
