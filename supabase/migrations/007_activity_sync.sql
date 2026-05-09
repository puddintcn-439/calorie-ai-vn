alter table public.activity_logs
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists synced_at timestamptz,
  add column if not exists steps_count integer,
  add column if not exists distance_km numeric(8,2);

update public.activity_logs
set source = 'manual'
where source is null;

alter table public.activity_logs
  drop constraint if exists activity_logs_source_check;

alter table public.activity_logs
  add constraint activity_logs_source_check
  check (source in ('manual', 'apple_health', 'google_fit', 'demo_sync'));

create unique index if not exists activity_logs_user_source_external_idx
  on public.activity_logs (user_id, source, external_id)
  where external_id is not null;

create index if not exists activity_logs_user_source_logged_at_idx
  on public.activity_logs (user_id, source, logged_at desc);