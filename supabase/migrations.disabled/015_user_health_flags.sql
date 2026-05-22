alter table public.users
  add column if not exists health_flags text[] not null default '{}';

alter table public.users
  drop constraint if exists users_health_flags_allowed;

alter table public.users
  add constraint users_health_flags_allowed
  check (
    health_flags <@ array[
      'pregnant',
      'breastfeeding',
      'kidney_disease',
      'diabetes',
      'eating_disorder_history',
      'weight_affecting_medication'
    ]::text[]
  );
