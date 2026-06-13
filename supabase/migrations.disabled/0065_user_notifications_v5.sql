-- Billing V5.5: durable user notifications for payment issue updates.
-- In-app notifications are persisted first; push/email delivery is tracked in channel_status.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  channel_status jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_id
  on public.user_notifications(user_id);

create index if not exists idx_user_notifications_read_at
  on public.user_notifications(read_at);

create index if not exists idx_user_notifications_created_at
  on public.user_notifications(created_at desc);

create index if not exists idx_user_notifications_type
  on public.user_notifications(type);

alter table public.user_notifications enable row level security;
