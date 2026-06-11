-- Admin Console V2: RBAC foundation
-- Roles: owner > admin > support > viewer

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'support', 'viewer')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  granted_by_email text null,
  granted_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_admin_roles_email_unique
  on public.admin_roles (lower(email));

create index if not exists idx_admin_roles_email
  on public.admin_roles (lower(email));

create index if not exists idx_admin_roles_role_status
  on public.admin_roles (role, status);

alter table public.admin_roles enable row level security;

-- Service-role/backend access is expected for Admin Console RBAC.
-- No public policies are added intentionally.

create or replace function public.touch_admin_roles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_roles_updated_at on public.admin_roles;
create trigger trg_admin_roles_updated_at
before update on public.admin_roles
for each row
execute function public.touch_admin_roles_updated_at();
