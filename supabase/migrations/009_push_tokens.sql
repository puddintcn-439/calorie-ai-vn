-- ==========================================
-- PUSH NOTIFICATION TOKENS TABLE
-- ==========================================
-- Stores Expo push notification tokens per user device
create table if not exists public.push_notification_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

create index push_tokens_user_idx on public.push_notification_tokens(user_id);

-- RLS: users manage only their own tokens
alter table public.push_notification_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.push_notification_tokens for all
  using (auth.uid() = user_id);

create policy "Service role full access on push tokens"
  on public.push_notification_tokens for all
  using (auth.role() = 'service_role');
