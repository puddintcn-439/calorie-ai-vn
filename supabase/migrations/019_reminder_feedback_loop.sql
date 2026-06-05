-- Reminder feedback loop: track whether a sent reminder was opened and led to action.

alter table public.reminder_notification_log
  add column if not exists opened_at timestamptz,
  add column if not exists acted_at timestamptz,
  add column if not exists acted_action_type text;

create index if not exists reminder_notification_log_opened_idx
  on public.reminder_notification_log(user_id, opened_at)
  where opened_at is not null;

create index if not exists reminder_notification_log_acted_idx
  on public.reminder_notification_log(user_id, acted_at)
  where acted_at is not null;
