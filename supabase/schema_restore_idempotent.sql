-- ============================================================
-- SCHEMA RESTORE — fully idempotent
-- Safe to run on any state: uses IF NOT EXISTS everywhere.
-- Run schema_audit.sql first to see what is already present.
--
-- Execution order:
--   1. Extensions
--   2. Core tables (users, foods)
--   3. User-dependent tables
--   4. Billing tables
--   5. Analytics / coaching tables
--   6. Column additions on existing tables
--   7. AI usage tables + functions (final v3 from migration 033)
--   8. Admin tables
--   9. Analytics views
--  10. Constraint patches & data normalisation (migration 037)
--
-- After running: execute schema_audit.sql to verify, then run
-- the backend /health endpoint to confirm DB connectivity.
-- ============================================================

begin;

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. CORE TABLES
-- ============================================================

-- 2a. users
create table if not exists public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  full_name             text,
  avatar_url            text,
  weight_kg             numeric(5,2),
  height_cm             numeric(5,1),
  age                   smallint check (age between 13 and 120),
  gender                text check (gender in ('male', 'female')),
  activity_level        text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal                  text check (goal in ('lose_weight','maintain','gain_muscle')),
  daily_calorie_target  integer default 1800,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.users enable row level security;
drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile" on public.users for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
drop policy if exists "Service role full access on users" on public.users;
create policy "Service role full access on users" on public.users for all using (auth.role() = 'service_role');

-- 2b. foods
create table if not exists public.foods (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  name_vi               text,
  category              text not null check (category in (
                          'rice_dish','noodle','meat','seafood','vegetable',
                          'fruit','drink','snack','dessert','fast_food','other')),
  is_vietnamese         boolean not null default false,
  calories_per_100g     numeric(7,2) not null,
  protein_g             numeric(6,2) not null default 0,
  carbs_g               numeric(6,2) not null default 0,
  fat_g                 numeric(6,2) not null default 0,
  fiber_g               numeric(6,2),
  sugar_g               numeric(6,2),
  sodium_mg             numeric(7,1),
  serving_size_g        numeric(6,1),
  serving_description   text,
  image_url             text,
  source                text not null check (source in ('usda','openfoodfacts','custom_vn','ai_estimated')),
  created_at            timestamptz not null default now()
);

create index if not exists foods_name_search_idx on public.foods using gin(
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(name_vi,''))
);
create index if not exists foods_is_vietnamese_idx on public.foods(is_vietnamese);
create index if not exists foods_category_idx on public.foods(category);

alter table public.foods enable row level security;
drop policy if exists "Anyone can read foods" on public.foods;
create policy "Anyone can read foods" on public.foods for select using (true);
drop policy if exists "Service role manages foods" on public.foods;
create policy "Service role manages foods" on public.foods for all using (auth.role() = 'service_role');

-- Seed Vietnamese foods (idempotent via on conflict do nothing)
insert into public.foods (name, name_vi, category, is_vietnamese, calories_per_100g, protein_g, carbs_g, fat_g, serving_size_g, serving_description, source) values
  ('Pho Bo',             'Phở bò',           'noodle',    true, 90,  6.5, 12.0, 2.5, 500, '1 tô',     'custom_vn'),
  ('Bun Bo Hue',         'Bún bò Huế',        'noodle',    true, 95,  7.0, 13.0, 2.8, 500, '1 tô',     'custom_vn'),
  ('Com Tam Suon',       'Cơm tấm sườn',      'rice_dish', true, 155, 7.0, 18.8, 5.5, 400, '1 dĩa',    'custom_vn'),
  ('Bun Dau Mam Tom',    'Bún đậu mắm tôm',   'noodle',    true, 130, 6.0, 16.0, 5.0, 300, '1 phần',   'custom_vn'),
  ('Banh Mi Thit',       'Bánh mì thịt',      'snack',     true, 280, 12.0,34.0, 10.0,150, '1 ổ',      'custom_vn'),
  ('Goi Cuon',           'Gỏi cuốn',          'snack',     true, 80,  4.0, 12.0, 1.5, 100, '2 cuốn',   'custom_vn'),
  ('Hu Tieu Nam Vang',   'Hủ tiếu Nam Vang',  'noodle',    true, 92,  6.0, 13.0, 2.2, 500, '1 tô',     'custom_vn'),
  ('Ca Phe Sua Da',      'Cà phê sữa đá',     'drink',     true, 75,  1.5, 12.0, 2.5, 200, '1 ly',     'custom_vn'),
  ('Tra Sua Tran Chau',  'Trà sữa trân châu', 'drink',     true, 130, 2.0, 25.0, 3.0, 500, '1 ly lớn', 'custom_vn'),
  ('Xoi Xeo',            'Xôi xéo',           'rice_dish', true, 200, 5.0, 38.0, 4.0, 300, '1 gói',    'custom_vn')
on conflict do nothing;

-- ============================================================
-- 3. USER-DEPENDENT TABLES
-- ============================================================

-- 3a. food_logs
create table if not exists public.food_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  food_id         uuid references public.foods(id),
  meal_type       text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  logged_at       timestamptz not null default now(),
  quantity        numeric(6,2) not null default 1,
  unit            text not null default 'gram',
  estimated_grams numeric(7,1) not null,
  calories        numeric(7,1) not null,
  protein_g       numeric(6,2) not null default 0,
  carbs_g         numeric(6,2) not null default 0,
  fat_g           numeric(6,2) not null default 0,
  name            text not null,
  name_vi         text,
  image_url       text,
  source          text not null check (source in ('ai_scan','manual_search','manual_entry','quick_add')),
  ai_scan_id      uuid,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx on public.food_logs(user_id, logged_at desc);
create index if not exists food_logs_meal_type_idx on public.food_logs(meal_type);

alter table public.food_logs enable row level security;
drop policy if exists "Users manage own logs" on public.food_logs;
create policy "Users manage own logs" on public.food_logs for all using (auth.uid() = user_id);
drop policy if exists "Service role full access on logs" on public.food_logs;
create policy "Service role full access on logs" on public.food_logs for all using (auth.role() = 'service_role');

-- 3b. saved_meals
create table if not exists public.saved_meals (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  name                text not null,
  items               jsonb not null default '[]',
  total_calories      numeric(7,1) not null default 0,
  total_protein_g     numeric(6,2) not null default 0,
  total_carbs_g       numeric(6,2) not null default 0,
  total_fat_g         numeric(6,2) not null default 0,
  use_count           integer not null default 0,
  last_used_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists saved_meals_user_idx on public.saved_meals(user_id, use_count desc);
alter table public.saved_meals enable row level security;
drop policy if exists "Users manage own saved meals" on public.saved_meals;
create policy "Users manage own saved meals" on public.saved_meals for all using (auth.uid() = user_id);

-- 3c. correction_events
create table if not exists public.correction_events (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  event_type          text not null check (event_type in ('item_mismatch','portion_adjusted','confidence_low','ai_result_corrected')),
  food_id             uuid,
  food_name           text,
  original_calories   numeric(7,1),
  corrected_calories  numeric(7,1),
  original_portion    numeric(6,2),
  corrected_portion   numeric(6,2),
  original_portion_unit text,
  ai_confidence       numeric(3,2),
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists correction_events_user_idx on public.correction_events(user_id);
create index if not exists correction_events_type_idx on public.correction_events(event_type);
create index if not exists correction_events_date_idx on public.correction_events(created_at);
create index if not exists correction_events_user_date_idx on public.correction_events(user_id, created_at desc);

alter table public.correction_events enable row level security;
drop policy if exists "Users manage own corrections" on public.correction_events;
create policy "Users manage own corrections" on public.correction_events for all using (auth.uid() = user_id);
drop policy if exists "Service role full access on corrections" on public.correction_events;
create policy "Service role full access on corrections" on public.correction_events for all using (auth.role() = 'service_role');

-- 3d. activity_logs
create table if not exists public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  activity_type   text not null,
  activity_name   text,
  duration_min    integer not null default 30,
  calories_burned integer not null default 0,
  logged_at       timestamptz not null default now(),
  notes           text,
  created_at      timestamptz default now()
);

alter table public.activity_logs enable row level security;
drop policy if exists "Users manage own activity logs" on public.activity_logs;
create policy "Users manage own activity logs"
  on public.activity_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists activity_logs_user_date on public.activity_logs(user_id, logged_at);

-- 3e. logging_events
create table if not exists public.logging_events (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  event_type        text not null check (event_type in ('log_attempted','log_parsed','log_failed')),
  input_mode        text not null check (input_mode in ('image','text','voice','receipt','barcode','search')),
  elapsed_ms        integer,
  correction_count  integer,
  item_count        integer,
  ai_confidence     numeric(4,3),
  reason_code       text,
  metadata          jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists logging_events_user_idx on public.logging_events(user_id);
create index if not exists logging_events_type_idx on public.logging_events(event_type);
create index if not exists logging_events_mode_idx on public.logging_events(input_mode);
create index if not exists logging_events_created_idx on public.logging_events(created_at);
create index if not exists logging_events_user_created_idx on public.logging_events(user_id, created_at desc);

alter table public.logging_events enable row level security;
drop policy if exists "Users manage own logging events" on public.logging_events;
create policy "Users manage own logging events" on public.logging_events for all using (auth.uid() = user_id);
drop policy if exists "Service role full access on logging events" on public.logging_events;
create policy "Service role full access on logging events" on public.logging_events for all using (auth.role() = 'service_role');

-- 3f. user_context_events
create table if not exists public.user_context_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  context_mode  varchar(50) not null,
  action        varchar(20) not null check (action in ('activated','deactivated')),
  created_at    timestamptz default now(),
  metadata      jsonb default null
);

create index if not exists idx_user_context_events_user_id on public.user_context_events(user_id);
create index if not exists idx_user_context_events_created_at on public.user_context_events(created_at desc);
create index if not exists idx_user_context_events_context_mode on public.user_context_events(context_mode);

alter table public.user_context_events enable row level security;
drop policy if exists "Users can view their own context events" on public.user_context_events;
create policy "Users can view their own context events" on public.user_context_events for select using (auth.uid() = user_id);
drop policy if exists "Users can insert their own context events" on public.user_context_events;
create policy "Users can insert their own context events" on public.user_context_events for insert with check (auth.uid() = user_id);

-- 3g. push_notification_tokens + reminder_preferences + reminder_notification_log
-- (Using the hardened schema from migration 018 which supersedes 0051)
create table if not exists public.reminder_preferences (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid not null unique references public.users(id) on delete cascade,
  breakfast_reminder_enabled  boolean not null default true,
  breakfast_reminder_time     text not null default '07:00',
  lunch_reminder_enabled      boolean not null default true,
  lunch_reminder_time         text not null default '12:00',
  dinner_reminder_enabled     boolean not null default true,
  dinner_reminder_time        text not null default '19:00',
  snack_reminder_enabled      boolean not null default false,
  snack_reminder_time         text not null default '15:00',
  allow_push_notifications    boolean not null default true,
  nudge_motivation_style      text not null default 'encouraging' check (nudge_motivation_style in ('encouraging','warning','neutral')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists reminder_preferences_user_idx on public.reminder_preferences(user_id);
alter table public.reminder_preferences enable row level security;
drop policy if exists "Users manage own preferences" on public.reminder_preferences;
create policy "Users manage own preferences" on public.reminder_preferences for all using (auth.uid() = user_id);
drop policy if exists "Service role full access on preferences" on public.reminder_preferences;
create policy "Service role full access on preferences" on public.reminder_preferences for all using (auth.role() = 'service_role');

create table if not exists public.push_notification_tokens (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  token                   text not null,
  platform                text not null check (platform in ('ios','android','web')),
  active                  boolean not null default true,
  device_id               text,
  app_version             text,
  timezone                text,
  timezone_offset_minutes integer,
  last_registered_at      timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_idx on public.push_notification_tokens(user_id);
create index if not exists push_tokens_active_user_idx on public.push_notification_tokens(user_id, active);
alter table public.push_notification_tokens enable row level security;
drop policy if exists "Users manage own push tokens" on public.push_notification_tokens;
create policy "Users manage own push tokens" on public.push_notification_tokens for all using (auth.uid() = user_id);
drop policy if exists "Service role full access on push tokens" on public.push_notification_tokens;
create policy "Service role full access on push tokens" on public.push_notification_tokens for all using (auth.role() = 'service_role');

create table if not exists public.reminder_notification_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null,
  meal_type   text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  local_date  date not null,
  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, token, meal_type, local_date)
);

create index if not exists reminder_notification_log_user_date_idx on public.reminder_notification_log(user_id, local_date);
alter table public.reminder_notification_log enable row level security;
drop policy if exists "Users read own reminder notification log" on public.reminder_notification_log;
create policy "Users read own reminder notification log" on public.reminder_notification_log for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on reminder notification log" on public.reminder_notification_log;
create policy "Service role full access on reminder notification log" on public.reminder_notification_log for all using (auth.role() = 'service_role');

-- 3h. user_subscriptions
create table if not exists public.user_subscriptions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  tier              text not null check (tier in ('free','premium','pro')) default 'free',
  started_at        timestamptz not null default now(),
  renews_at         timestamptz,
  cancelled_at      timestamptz,
  is_active         boolean not null default true,
  payment_provider  text,
  payment_id        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists user_subscriptions_user_idx on public.user_subscriptions(user_id);
create index if not exists user_subscriptions_tier_idx on public.user_subscriptions(tier);
create index if not exists user_subscriptions_active_idx on public.user_subscriptions(is_active);
create index if not exists user_subscriptions_renews_idx on public.user_subscriptions(renews_at);

alter table public.user_subscriptions enable row level security;
drop policy if exists "Users view own subscription" on public.user_subscriptions;
create policy "Users view own subscription" on public.user_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on subscriptions" on public.user_subscriptions;
create policy "Service role full access on subscriptions" on public.user_subscriptions for all using (auth.role() = 'service_role');

-- ============================================================
-- 4. BILLING TABLES (dependency chain: customers → subscriptions → invoices → refunds → events)
-- ============================================================

create table if not exists public.billing_customers (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  provider                text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  provider_customer_id    text,
  email                   text,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create index if not exists idx_billing_customers_user_id on public.billing_customers(user_id);
alter table public.billing_customers enable row level security;

create table if not exists public.billing_subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  billing_customer_id       uuid references public.billing_customers(id) on delete set null,
  provider                  text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  provider_subscription_id  text,
  tier                      text not null check (tier in ('free','premium','pro')),
  status                    text not null check (status in ('trialing','active','past_due','cancelled','expired','refunded')),
  is_paid                   boolean not null default false,
  billing_period_start      timestamptz,
  billing_period_end        timestamptz,
  cancelled_at              timestamptz,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index if not exists idx_billing_subscriptions_user_id on public.billing_subscriptions(user_id);
create index if not exists idx_billing_subscriptions_status_paid on public.billing_subscriptions(status, is_paid);
alter table public.billing_subscriptions enable row level security;

create table if not exists public.billing_invoices (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  billing_subscription_id     uuid references public.billing_subscriptions(id) on delete set null,
  provider                    text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  provider_invoice_id         text,
  tier                        text not null check (tier in ('free','premium','pro')),
  status                      text not null check (status in ('draft','open','paid','void','uncollectible','refunded')),
  amount_original             numeric(12,4) not null default 0,
  currency_original           text not null default 'VND',
  amount_vnd                  numeric(14,2) not null default 0,
  amount_usd                  numeric(14,4) not null default 0,
  fx_rate                     numeric(14,4) not null default 26000,
  billing_period_start        timestamptz,
  billing_period_end          timestamptz,
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  metadata                    jsonb not null default '{}'::jsonb,
  raw_payload                 jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create index if not exists idx_billing_invoices_user_id on public.billing_invoices(user_id);
create index if not exists idx_billing_invoices_paid_at on public.billing_invoices(paid_at);
alter table public.billing_invoices enable row level security;

create table if not exists public.billing_refunds (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  billing_invoice_id    uuid references public.billing_invoices(id) on delete set null,
  provider              text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  provider_refund_id    text,
  amount_original       numeric(12,4) not null default 0,
  currency_original     text not null default 'VND',
  amount_vnd            numeric(14,2) not null default 0,
  amount_usd            numeric(14,4) not null default 0,
  fx_rate               numeric(14,4) not null default 26000,
  refunded_at           timestamptz not null default now(),
  reason                text,
  metadata              jsonb not null default '{}'::jsonb,
  raw_payload           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  unique (provider, provider_refund_id)
);

create index if not exists idx_billing_refunds_user_id on public.billing_refunds(user_id);
create index if not exists idx_billing_refunds_refunded_at on public.billing_refunds(refunded_at);
alter table public.billing_refunds enable row level security;

create table if not exists public.billing_events (
  id                        uuid primary key default gen_random_uuid(),
  provider                  text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  provider_event_id         text not null,
  event_type                text not null,
  user_id                   uuid references public.users(id) on delete set null,
  billing_subscription_id   uuid references public.billing_subscriptions(id) on delete set null,
  billing_invoice_id        uuid references public.billing_invoices(id) on delete set null,
  billing_refund_id         uuid references public.billing_refunds(id) on delete set null,
  processed_at              timestamptz,
  status                    text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error_message             text,
  raw_payload               jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_billing_events_provider_event on public.billing_events(provider, provider_event_id);
create index if not exists idx_billing_events_status_created_at on public.billing_events(status, created_at);
alter table public.billing_events enable row level security;

create table if not exists public.billing_payment_issues (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  invoice_id              uuid references public.billing_invoices(id) on delete set null,
  subscription_id         uuid references public.billing_subscriptions(id) on delete set null,
  provider                text not null check (provider in ('stripe','app_store','google_play','payos','manual','trial')),
  issue_type              text not null check (issue_type in ('refund_request','duplicate_payment','payment_succeeded_but_not_activated','wrong_plan','other')),
  status                  text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  user_message            text,
  admin_note              text,
  resolution              text,
  created_by_user_id      uuid references public.users(id) on delete set null,
  resolved_at             timestamptz,
  resolved_by_admin_id    uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_billing_payment_issues_user_id on public.billing_payment_issues(user_id);
create index if not exists idx_billing_payment_issues_status on public.billing_payment_issues(status, created_at);
alter table public.billing_payment_issues enable row level security;
drop policy if exists "Users view own payment issues" on public.billing_payment_issues;
create policy "Users view own payment issues" on public.billing_payment_issues for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on payment issues" on public.billing_payment_issues;
create policy "Service role full access on payment issues" on public.billing_payment_issues for all using (auth.role() = 'service_role');

-- ============================================================
-- 5. COACHING / ANALYTICS / PROGRESS TABLES
-- ============================================================

-- 5a. user_behavioral_patterns
create table if not exists public.user_behavioral_patterns (
  id                bigserial primary key,
  user_id           uuid not null references public.users(id) on delete cascade,
  pattern_type      text not null check (pattern_type in (
    'stress_eating','skipped_meals','binge_episodes','timing_preference',
    'weekend_variance','emotional_trigger','night_eating','inconsistent_logging'
  )),
  severity_level    integer check (severity_level between 1 and 5),
  first_detected_at timestamptz default now(),
  last_detected_at  timestamptz default now(),
  frequency_score   decimal(3,2),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint user_behavioral_patterns_user_pattern_type_key unique (user_id, pattern_type)
);

create index if not exists idx_patterns_detected_at on public.user_behavioral_patterns(user_id, last_detected_at);
alter table public.user_behavioral_patterns enable row level security;
drop policy if exists "Users can view own patterns" on public.user_behavioral_patterns;
create policy "Users can view own patterns" on public.user_behavioral_patterns for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on patterns" on public.user_behavioral_patterns;
create policy "Service role full access on patterns" on public.user_behavioral_patterns for all using (auth.role() = 'service_role');

-- 5b. user_coaching_insights
create table if not exists public.user_coaching_insights (
  id                  bigserial primary key,
  user_id             uuid not null references public.users(id) on delete cascade,
  insight_type        text not null check (insight_type in (
    'pattern_alert','achievement','opportunity','warning','personalized_advice'
  )),
  title               text not null,
  description         text not null,
  action_suggestion   text,
  impact_score        integer,
  pattern_id          bigint references public.user_behavioral_patterns(id),
  affected_meal_type  text,
  is_acknowledged     boolean default false,
  acknowledged_at     timestamptz,
  created_at          timestamptz default now(),
  expires_at          timestamptz,
  constraint valid_expiry check (expires_at is null or expires_at > created_at)
);

create index if not exists idx_insights_user_type on public.user_coaching_insights(user_id, insight_type);
create index if not exists idx_insights_created on public.user_coaching_insights(user_id, created_at desc);
alter table public.user_coaching_insights enable row level security;
drop policy if exists "Users can view own insights" on public.user_coaching_insights;
create policy "Users can view own insights" on public.user_coaching_insights for select using (auth.uid() = user_id);
drop policy if exists "Users can acknowledge insights" on public.user_coaching_insights;
create policy "Users can acknowledge insights" on public.user_coaching_insights for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Service role full access on insights" on public.user_coaching_insights;
create policy "Service role full access on insights" on public.user_coaching_insights for all using (auth.role() = 'service_role');

-- 5c. user_coaching_summaries
create table if not exists public.user_coaching_summaries (
  id                      bigserial primary key,
  user_id                 uuid not null references public.users(id) on delete cascade,
  week_start_date         date not null,
  logs_count              integer,
  adherence_percentage    integer,
  consistency_score       decimal(3,2),
  primary_pattern         text,
  secondary_patterns      text[],
  insights_generated      integer,
  total_calories          decimal(10,2),
  average_daily_calories  decimal(10,2),
  calorie_variance        decimal(10,2),
  days_above_target       integer,
  days_below_target       integer,
  days_on_target          integer,
  recommended_action      text,
  priority_level          text check (priority_level in ('low','medium','high','critical')),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists idx_summaries_user_week on public.user_coaching_summaries(user_id, week_start_date desc);
alter table public.user_coaching_summaries enable row level security;
drop policy if exists "Users can view own summaries" on public.user_coaching_summaries;
create policy "Users can view own summaries" on public.user_coaching_summaries for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on summaries" on public.user_coaching_summaries;
create policy "Service role full access on summaries" on public.user_coaching_summaries for all using (auth.role() = 'service_role');

-- 5d. body_progress
create table if not exists public.body_progress (
  id              bigserial primary key,
  user_id         uuid not null references public.users(id) on delete cascade,
  recorded_at     date not null default current_date,
  weight_kg       numeric(5,2),
  waist_cm        numeric(5,1),
  hip_cm          numeric(5,1),
  chest_cm        numeric(5,1),
  arm_cm          numeric(5,1),
  thigh_cm        numeric(5,1),
  body_fat_pct    numeric(4,1),
  muscle_mass_kg  numeric(5,2),
  note            text,
  energy_level    smallint check (energy_level between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists body_progress_user_date on public.body_progress(user_id, recorded_at);
create index if not exists body_progress_user_recent on public.body_progress(user_id, recorded_at desc);
alter table public.body_progress enable row level security;
drop policy if exists body_progress_select on public.body_progress;
create policy body_progress_select on public.body_progress for select using (auth.uid() = user_id);
drop policy if exists body_progress_insert on public.body_progress;
create policy body_progress_insert on public.body_progress for insert with check (auth.uid() = user_id);
drop policy if exists body_progress_update on public.body_progress;
create policy body_progress_update on public.body_progress for update using (auth.uid() = user_id);
drop policy if exists body_progress_delete on public.body_progress;
create policy body_progress_delete on public.body_progress for delete using (auth.uid() = user_id);

create or replace function public.update_body_progress_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists body_progress_updated_at on public.body_progress;
create trigger body_progress_updated_at before update on public.body_progress
  for each row execute function public.update_body_progress_updated_at();

-- 5e. user_daily_roadmap
create table if not exists public.user_daily_roadmap (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  logged_date     date not null,
  task_id         text not null,
  task_title      text not null,
  activity_type   text not null,
  duration_min    integer not null default 30,
  estimated_kcal  integer not null default 0,
  is_custom       boolean default false,
  is_removed      boolean default false,
  is_completed    boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.user_daily_roadmap enable row level security;
drop policy if exists "Users manage own roadmap" on public.user_daily_roadmap;
create policy "Users manage own roadmap" on public.user_daily_roadmap for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists user_daily_roadmap_user_date on public.user_daily_roadmap(user_id, logged_date);
create index if not exists user_daily_roadmap_user_task on public.user_daily_roadmap(user_id, task_id);

-- 5f. user_activity_preferences
create table if not exists public.user_activity_preferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         text not null,
  activity_type text not null check (activity_type in ('running','walking','cycling','swimming','gym','yoga','football','basketball','other')),
  duration_min  integer not null default 30 check (duration_min between 1 and 600),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.user_activity_preferences enable row level security;
drop policy if exists "Users manage own activity preferences" on public.user_activity_preferences;
create policy "Users manage own activity preferences" on public.user_activity_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists user_activity_preferences_user_active_order_idx
  on public.user_activity_preferences(user_id, is_active, sort_order, created_at);

-- 5g. user_intervention_events (migration 020)
create table if not exists public.user_intervention_events (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  intervention_type           text not null,
  mode                        text not null,
  priority                    text not null,
  primary_action              text not null,
  event_type                  text not null check (event_type in ('shown','acted','dismissed')),
  source                      text not null default 'today',
  forecast_score              integer,
  intervention_generated_at   timestamptz,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);

alter table public.user_intervention_events enable row level security;
drop policy if exists "Users manage own intervention events" on public.user_intervention_events;
create policy "Users manage own intervention events" on public.user_intervention_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists user_intervention_events_user_created_idx on public.user_intervention_events(user_id, created_at desc);
create index if not exists user_intervention_events_user_type_idx on public.user_intervention_events(user_id, intervention_type, created_at desc);
create index if not exists user_intervention_events_user_event_idx on public.user_intervention_events(user_id, event_type, created_at desc);

-- 5h. behavior_forecast_snapshots (migration 021)
create table if not exists public.behavior_forecast_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  local_date            date not null,
  source                text not null default 'today' check (source in ('today','coach')),
  forecast_score        integer not null check (forecast_score between 0 and 100),
  forecast_label        text not null,
  risk_level            text not null,
  confidence            text not null,
  health_score_overall  integer,
  adherence_score       integer,
  weakest_area          text,
  forecast              jsonb not null default '{}'::jsonb,
  health_score          jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, local_date, source)
);

alter table public.behavior_forecast_snapshots enable row level security;
drop policy if exists "Users manage own forecast snapshots" on public.behavior_forecast_snapshots;
create policy "Users manage own forecast snapshots" on public.behavior_forecast_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Service role full access on forecast snapshots" on public.behavior_forecast_snapshots;
create policy "Service role full access on forecast snapshots" on public.behavior_forecast_snapshots for all
  using (auth.role() = 'service_role');
create index if not exists behavior_forecast_snapshots_user_date_idx on public.behavior_forecast_snapshots(user_id, local_date desc);
create index if not exists behavior_forecast_snapshots_created_idx on public.behavior_forecast_snapshots(created_at desc);

create or replace function public.set_behavior_forecast_snapshot_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists behavior_forecast_snapshots_updated_at on public.behavior_forecast_snapshots;
create trigger behavior_forecast_snapshots_updated_at before update on public.behavior_forecast_snapshots
  for each row execute function public.set_behavior_forecast_snapshot_updated_at();

-- ============================================================
-- 6. COLUMN ADDITIONS ON EXISTING TABLES
-- ============================================================

-- 6a. users: subscription_tier
alter table public.users
  add column if not exists subscription_tier text default 'free'
    check (subscription_tier in ('free','premium','pro'));

-- 6a-i. user_subscriptions: remove legacy payment_id (superseded by billing_subscriptions.provider_subscription_id)
alter table public.user_subscriptions drop column if exists payment_id;

-- 6b. users: per-meal targets
alter table public.users
  add column if not exists target_breakfast_cal integer default 400,
  add column if not exists target_lunch_cal     integer default 600,
  add column if not exists target_dinner_cal    integer default 600,
  add column if not exists target_snack_cal     integer default 200;

-- 6c. users: health_flags
alter table public.users add column if not exists health_flags text[] not null default '{}';
alter table public.users drop constraint if exists users_health_flags_allowed;
alter table public.users add constraint users_health_flags_allowed
  check (health_flags <@ array['pregnant','breastfeeding','kidney_disease','diabetes',
                                'eating_disorder_history','weight_affecting_medication']::text[]);

-- 6d. users: goal_plan (migration 017)
alter table public.users add column if not exists goal_plan jsonb;
alter table public.users drop constraint if exists users_goal_plan_is_object;
alter table public.users add constraint users_goal_plan_is_object
  check (goal_plan is null or jsonb_typeof(goal_plan) = 'object');

-- 6e. activity_logs: sync columns (migration 007)
alter table public.activity_logs
  add column if not exists source       text not null default 'manual',
  add column if not exists external_id  text,
  add column if not exists synced_at    timestamptz,
  add column if not exists steps_count  integer,
  add column if not exists distance_km  numeric(8,2);

alter table public.activity_logs drop constraint if exists activity_logs_source_check;
alter table public.activity_logs add constraint activity_logs_source_check
  check (source in ('manual','apple_health','google_fit','demo_sync'));

create unique index if not exists activity_logs_user_source_external_idx
  on public.activity_logs(user_id, source, external_id) where external_id is not null;
create index if not exists activity_logs_user_source_logged_at_idx
  on public.activity_logs(user_id, source, logged_at desc);

-- 6f. activity_logs: exercises column (migration 010a)
alter table public.activity_logs add column if not exists exercises jsonb default '[]'::jsonb;

-- 6g. foods: quality nutrients (migration 016)
alter table public.foods add column if not exists saturated_fat_g numeric(6,2);

-- 6h. food_logs: quality nutrients (migration 016)
alter table public.food_logs
  add column if not exists fiber_g         numeric(6,2),
  add column if not exists sugar_g         numeric(6,2),
  add column if not exists saturated_fat_g numeric(6,2),
  add column if not exists sodium_mg       numeric(7,1);

-- 6i. saved_meals: quality nutrients (migration 016)
alter table public.saved_meals
  add column if not exists total_fiber_g         numeric(6,2) not null default 0,
  add column if not exists total_sugar_g         numeric(6,2) not null default 0,
  add column if not exists total_saturated_fat_g numeric(6,2) not null default 0,
  add column if not exists total_sodium_mg       numeric(7,1) not null default 0;

-- 6j. push_notification_tokens: hardened device metadata (migration 018, additive)
alter table public.push_notification_tokens
  add column if not exists active                  boolean not null default true,
  add column if not exists device_id               text,
  add column if not exists app_version             text,
  add column if not exists timezone                text,
  add column if not exists timezone_offset_minutes integer,
  add column if not exists last_registered_at      timestamptz not null default now();

-- 6k. reminder_notification_log: feedback loop (migration 019)
alter table public.reminder_notification_log
  add column if not exists opened_at        timestamptz,
  add column if not exists acted_at         timestamptz,
  add column if not exists acted_action_type text;

create index if not exists reminder_notification_log_opened_idx
  on public.reminder_notification_log(user_id, opened_at) where opened_at is not null;
create index if not exists reminder_notification_log_acted_idx
  on public.reminder_notification_log(user_id, acted_at) where acted_at is not null;

-- 6l. correction_events: remove scan_image_url (migration 022b)
alter table public.correction_events drop column if exists scan_image_url;

-- ============================================================
-- 7. AI USAGE TABLES + FUNCTIONS (final version = migration 033)
-- ============================================================

create table if not exists public.ai_usage_events (
  id                  uuid primary key default uuid_generate_v4(),
  request_id          uuid not null unique,
  user_id             uuid not null references public.users(id) on delete cascade,
  feature             text not null,
  plan_tier           text not null,
  provider            text,
  model               text,
  status              text not null default 'reserved'
                        check (status in ('reserved','success','failed','fallback','blocked')),
  cache_hit           boolean not null default false,
  estimated_cost_usd  numeric(12,6) not null default 0,
  input_tokens        integer,
  output_tokens       integer,
  credits_consumed    integer not null default 1,
  error_category      text,
  error_message       text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index if not exists ai_usage_events_feature_created_idx on public.ai_usage_events(feature, created_at desc);
create index if not exists ai_usage_events_status_idx on public.ai_usage_events(status);
create index if not exists ai_usage_events_provider_idx on public.ai_usage_events(provider);
create index if not exists ai_usage_events_user_feature_status_created_idx
  on public.ai_usage_events(user_id, feature, status, created_at desc);
create index if not exists ai_usage_events_user_status_created_idx
  on public.ai_usage_events(user_id, status, created_at desc);

alter table public.ai_usage_events enable row level security;
drop policy if exists "Users can view own AI usage" on public.ai_usage_events;
create policy "Users can view own AI usage" on public.ai_usage_events for select using (auth.uid() = user_id);
drop policy if exists "Service role full access on AI usage" on public.ai_usage_events;
create policy "Service role full access on AI usage" on public.ai_usage_events for all using (auth.role() = 'service_role');

-- Final reserve function (v3 from migration 033: cross-feature credit budget)
create or replace function public.reserve_ai_usage_event(
  p_request_id          uuid,
  p_user_id             uuid,
  p_feature             text,
  p_plan_tier           text,
  p_provider            text,
  p_model               text,
  p_daily_limit         integer,
  p_monthly_limit       integer,
  p_estimated_cost_usd  numeric,
  p_credit_cost         integer default 1,
  p_daily_credit_limit  integer default null,
  p_monthly_credit_limit integer default null
) returns setof public.ai_usage_events
language plpgsql security definer as $$
declare
  v_daily_used          integer;
  v_monthly_used        integer;
  v_daily_credits_used  integer;
  v_monthly_credits_used integer;
  v_credit_cost         integer := greatest(coalesce(p_credit_cost, 1), 1);
  v_status              text := 'reserved';
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into v_daily_used
  from public.ai_usage_events
  where user_id = p_user_id and feature = p_feature
    and status in ('reserved','success','failed','fallback')
    and created_at >= date_trunc('day', now());

  select count(*) into v_monthly_used
  from public.ai_usage_events
  where user_id = p_user_id and feature = p_feature
    and status in ('reserved','success','failed','fallback')
    and created_at >= date_trunc('month', now());

  select coalesce(sum(credits_consumed), 0) into v_daily_credits_used
  from public.ai_usage_events
  where user_id = p_user_id
    and status in ('reserved','success','failed','fallback')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(credits_consumed), 0) into v_monthly_credits_used
  from public.ai_usage_events
  where user_id = p_user_id
    and status in ('reserved','success','failed','fallback')
    and created_at >= date_trunc('month', now());

  if (p_daily_limit is not null and p_daily_limit >= 0 and v_daily_used >= p_daily_limit)
     or (p_monthly_limit is not null and p_monthly_limit >= 0 and v_monthly_used >= p_monthly_limit)
     or (p_daily_credit_limit is not null and p_daily_credit_limit >= 0 and v_daily_credits_used + v_credit_cost > p_daily_credit_limit)
     or (p_monthly_credit_limit is not null and p_monthly_credit_limit >= 0 and v_monthly_credits_used + v_credit_cost > p_monthly_credit_limit) then
    v_status := 'blocked';
  end if;

  return query
  insert into public.ai_usage_events (
    request_id, user_id, feature, plan_tier, provider, model,
    status, cache_hit, estimated_cost_usd, credits_consumed, created_at
  ) values (
    p_request_id, p_user_id, p_feature, p_plan_tier, p_provider, p_model,
    v_status, false, coalesce(p_estimated_cost_usd, 0), v_credit_cost, now()
  ) returning *;
end;
$$;

create or replace function public.finalize_ai_usage_event(
  p_usage_event_id      uuid,
  p_status              text,
  p_cache_hit           boolean default false,
  p_provider            text default null,
  p_model               text default null,
  p_input_tokens        integer default null,
  p_output_tokens       integer default null,
  p_estimated_cost_usd  numeric default null,
  p_error_category      text default null,
  p_error_message       text default null,
  p_credits_consumed    integer default null
) returns public.ai_usage_events
language plpgsql security definer as $$
declare v_row public.ai_usage_events;
begin
  update public.ai_usage_events set
    status              = p_status,
    cache_hit           = coalesce(p_cache_hit, false),
    provider            = coalesce(p_provider, provider),
    model               = coalesce(p_model, model),
    input_tokens        = coalesce(p_input_tokens, input_tokens),
    output_tokens       = coalesce(p_output_tokens, output_tokens),
    estimated_cost_usd  = coalesce(p_estimated_cost_usd, estimated_cost_usd),
    credits_consumed    = greatest(coalesce(p_credits_consumed, credits_consumed), 0),
    error_category      = coalesce(p_error_category, error_category),
    error_message       = coalesce(p_error_message, error_message),
    completed_at        = now()
  where id = p_usage_event_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ============================================================
-- 8. ADMIN TABLES
-- ============================================================

create table if not exists public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid null,
  actor_email     text not null,
  action          text not null,
  target_type     text not null,
  target_id       text null,
  reason          text null,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      text null,
  user_agent      text null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_actor_email on public.admin_audit_log(lower(actor_email));
create index if not exists idx_admin_audit_log_action on public.admin_audit_log(action);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log(target_type, target_id);
alter table public.admin_audit_log enable row level security;

create table if not exists public.admin_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid null,
  email           text not null,
  role            text not null check (role in ('owner','admin','support','viewer')),
  status          text not null default 'active' check (status in ('active','disabled')),
  granted_by_email text null,
  granted_reason  text null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_admin_roles_email_unique on public.admin_roles(lower(email));
create index if not exists idx_admin_roles_email on public.admin_roles(lower(email));
create index if not exists idx_admin_roles_role_status on public.admin_roles(role, status);
alter table public.admin_roles enable row level security;

create or replace function public.touch_admin_roles_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_admin_roles_updated_at on public.admin_roles;
create trigger trg_admin_roles_updated_at before update on public.admin_roles
  for each row execute function public.touch_admin_roles_updated_at();

create table if not exists public.admin_quota_adjustments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  scope         text not null check (scope in ('daily','monthly')),
  credits_delta integer not null,
  reason        text not null,
  actor_email   text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_admin_quota_adjustments_user_scope_expires
  on public.admin_quota_adjustments(user_id, scope, expires_at desc);
create index if not exists idx_admin_quota_adjustments_actor_email
  on public.admin_quota_adjustments(lower(actor_email));
alter table public.admin_quota_adjustments enable row level security;

-- ============================================================
-- 9. ANALYTICS VIEWS (depend on tables created above)
-- ============================================================

create or replace view public.beta_intervention_performance_30d as
select
  user_id, intervention_type, mode, primary_action,
  count(*) filter (where event_type = 'shown')::integer     as shown,
  count(*) filter (where event_type = 'acted')::integer     as acted,
  count(*) filter (where event_type = 'dismissed')::integer as dismissed,
  case when count(*) filter (where event_type = 'shown') = 0 then 0
       else round((count(*) filter (where event_type = 'acted'))::numeric * 100
                  / nullif(count(*) filter (where event_type = 'shown'), 0))::integer
  end as action_rate,
  case when count(*) filter (where event_type = 'shown') = 0 then 0
       else round((count(*) filter (where event_type = 'dismissed'))::numeric * 100
                  / nullif(count(*) filter (where event_type = 'shown'), 0))::integer
  end as dismiss_rate,
  case when count(*) filter (where event_type = 'shown') >= 20 then 'ready'
       when count(*) filter (where event_type = 'shown') > 0   then 'learning'
       else 'insufficient' end as sample_status
from public.user_intervention_events
where created_at >= now() - interval '30 days'
group by user_id, intervention_type, mode, primary_action;
alter view public.beta_intervention_performance_30d set (security_invoker = true);

create or replace view public.beta_reminder_fatigue_weekly as
with weekly as (
  select user_id,
    date_trunc('week', local_date::timestamp)::date as week_start,
    count(*)::integer                                as sent,
    count(opened_at)::integer                        as opened,
    count(acted_at)::integer                         as acted,
    (count(*) - count(opened_at))::integer           as ignored,
    case when count(*) = 0 then 0 else round(count(opened_at)::numeric * 100 / count(*))::integer end as open_rate,
    case when count(*) = 0 then 0 else round(count(acted_at)::numeric  * 100 / count(*))::integer end as action_rate
  from public.reminder_notification_log
  where sent_at >= now() - interval '90 days'
  group by user_id, date_trunc('week', local_date::timestamp)::date
),
with_prev as (
  select weekly.*, lag(open_rate) over (partition by user_id order by week_start) as previous_open_rate
  from weekly
)
select *,
  case when previous_open_rate is null then false
       when previous_open_rate - open_rate >= 25 then true
       else false end as fatigue_flag
from with_prev;
alter view public.beta_reminder_fatigue_weekly set (security_invoker = true);

create or replace view public.beta_forecast_accuracy_weekly as
with actuals as (
  select user_id, week_start,
    sum(food_logged)::integer      as food_days,
    sum(activity_logged)::integer  as activity_days,
    sum(roadmap_total)::integer    as roadmap_total,
    sum(roadmap_completed)::integer as roadmap_completed
  from (
    select user_id, date_trunc('week', logged_day::timestamp)::date as week_start,
      max(food_logged)::integer      as food_logged,
      max(activity_logged)::integer  as activity_logged,
      max(roadmap_total)::integer    as roadmap_total,
      max(roadmap_completed)::integer as roadmap_completed
    from (
      select user_id, logged_at::date as logged_day, 1 as food_logged, 0 as activity_logged, 0 as roadmap_total, 0 as roadmap_completed
      from public.food_logs where logged_at >= now() - interval '120 days'
      union all
      select user_id, logged_at::date, 0, 1, 0, 0
      from public.activity_logs where logged_at >= now() - interval '120 days'
      union all
      select user_id, logged_date, 0, 0, count(*)::integer, count(*) filter (where is_completed)::integer
      from public.user_daily_roadmap where logged_date >= current_date - 120
      group by user_id, logged_date
    ) s
    group by user_id, logged_day
  ) d
  group by user_id, week_start
),
scored as (
  select user_id, week_start, food_days, activity_days, roadmap_total, roadmap_completed,
    round(least(food_days::numeric/5,1)*45 + least(activity_days::numeric/3,1)*35
          + case when roadmap_total > 0 then least(roadmap_completed::numeric/roadmap_total,1)*20 else 0 end)::integer
    as actual_adherence_score
  from actuals
)
select
  snapshots.id as snapshot_id, snapshots.user_id, snapshots.local_date,
  date_trunc('week', snapshots.local_date::timestamp)::date as week_start,
  snapshots.source, snapshots.forecast_score, snapshots.forecast_label,
  snapshots.risk_level, snapshots.confidence, snapshots.health_score_overall,
  snapshots.adherence_score                              as predicted_adherence_score,
  coalesce(scored.actual_adherence_score, 0)            as actual_adherence_score,
  coalesce(scored.food_days, 0)                         as food_days,
  coalesce(scored.activity_days, 0)                     as activity_days,
  coalesce(scored.roadmap_total, 0)                     as roadmap_total,
  coalesce(scored.roadmap_completed, 0)                 as roadmap_completed,
  abs(snapshots.forecast_score - coalesce(scored.actual_adherence_score,0)) as absolute_error,
  (snapshots.forecast_score >= 70)                      as predicted_success,
  (coalesce(scored.actual_adherence_score,0) >= 70)     as actual_success
from public.behavior_forecast_snapshots snapshots
left join scored on scored.user_id = snapshots.user_id
  and scored.week_start = date_trunc('week', snapshots.local_date::timestamp)::date;
alter view public.beta_forecast_accuracy_weekly set (security_invoker = true);

create or replace view public.beta_forecast_calibration as
with completed as (
  select forecast_score, actual_success from public.beta_forecast_accuracy_weekly
  where local_date <= current_date - 7
),
bucketed as (
  select
    case when forecast_score < 20 then 1 when forecast_score < 40 then 2
         when forecast_score < 60 then 3 when forecast_score < 80 then 4 else 5 end as bucket_order,
    case when forecast_score < 20 then '0-20' when forecast_score < 40 then '20-40'
         when forecast_score < 60 then '40-60' when forecast_score < 80 then '60-80' else '80-100' end as forecast_bucket,
    forecast_score, actual_success
  from completed
),
aggregated as (
  select bucket_order, forecast_bucket,
    count(*)::integer                                                      as samples,
    round(avg(forecast_score)::numeric, 1)                                 as avg_forecast_score,
    round(avg(case when actual_success then 100 else 0 end)::numeric, 1)   as actual_success_rate
  from bucketed group by bucket_order, forecast_bucket
)
select bucket_order, forecast_bucket, samples, avg_forecast_score, actual_success_rate,
  round(abs(avg_forecast_score - actual_success_rate), 1) as calibration_error,
  case when samples < 20 then 'insufficient'
       when avg_forecast_score - actual_success_rate >= 15 then 'overconfident'
       when actual_success_rate - avg_forecast_score >= 15 then 'underconfident'
       else 'calibrated' end as calibration_status,
  case when samples < 20 then 'low' when samples < 100 then 'medium' else 'high' end as confidence_level
from aggregated order by bucket_order;
alter view public.beta_forecast_calibration set (security_invoker = true);

create or replace view public.beta_daily_engagement_30d as
with days as (
  select users.id as user_id, series.day::date as local_date
  from public.users
  cross join generate_series(current_date - 29, current_date, interval '1 day') as series(day)
)
select days.user_id, days.local_date,
  count(distinct food_logs.id)::integer        as food_logs,
  count(distinct activity_logs.id)::integer    as activity_logs,
  count(distinct roadmap.id)::integer          as roadmap_tasks,
  count(distinct roadmap.id) filter (where roadmap.is_completed)::integer as roadmap_completed,
  count(distinct reminders.id)::integer        as reminders_sent,
  count(distinct reminders.id) filter (where reminders.opened_at is not null)::integer as reminders_opened,
  count(distinct reminders.id) filter (where reminders.acted_at is not null)::integer  as reminders_acted,
  count(distinct interventions.id) filter (where interventions.event_type = 'shown')::integer  as interventions_shown,
  count(distinct interventions.id) filter (where interventions.event_type = 'acted')::integer  as interventions_acted,
  count(distinct snapshots.id)::integer        as forecast_snapshots
from days
left join public.food_logs       on food_logs.user_id       = days.user_id and food_logs.logged_at::date       = days.local_date
left join public.activity_logs   on activity_logs.user_id   = days.user_id and activity_logs.logged_at::date   = days.local_date
left join public.user_daily_roadmap roadmap on roadmap.user_id = days.user_id and roadmap.logged_date = days.local_date
left join public.reminder_notification_log reminders on reminders.user_id = days.user_id and reminders.local_date = days.local_date
left join public.user_intervention_events interventions on interventions.user_id = days.user_id and interventions.created_at::date = days.local_date
left join public.behavior_forecast_snapshots snapshots on snapshots.user_id = days.user_id and snapshots.local_date = days.local_date
group by days.user_id, days.local_date;
alter view public.beta_daily_engagement_30d set (security_invoker = true);

-- ============================================================
-- 10. CONSTRAINT PATCHES & DATA NORMALISATION (migration 037)
-- Depends on billing_subscriptions existing (created in section 4).
-- Safe to run: uses ON CONFLICT DO UPDATE and upsert patterns.
-- ============================================================

-- Allow renews_at to be null in user_subscriptions
alter table public.user_subscriptions alter column renews_at drop not null;

-- Expand payment_provider constraint to include all current providers
do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'user_subscriptions'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%payment_provider%'
  loop
    execute format('alter table public.user_subscriptions drop constraint %I', v_constraint_name);
  end loop;
  alter table public.user_subscriptions drop constraint if exists user_subscriptions_payment_provider_check;
  alter table public.user_subscriptions add constraint user_subscriptions_payment_provider_check
    check (payment_provider is null or
           payment_provider in ('stripe','app_store','google_play','payos','manual','trial','in_app'));
end $$;

-- Mark cancelled legacy rows as inactive if no active paid billing record backs them
update public.user_subscriptions us
set is_active = false, updated_at = now()
where us.cancelled_at is not null
  and us.is_active is distinct from false
  and not exists (
    select 1 from public.billing_subscriptions bs
    where bs.user_id = us.user_id and bs.is_paid = true
      and lower(bs.status) = 'active' and bs.cancelled_at is null
      and bs.tier in ('premium','pro')
      and (bs.billing_period_end is null or bs.billing_period_end > now())
  );

-- Mirror strongest active paid entitlement into legacy bridge
with active_paid_billing as (
  select bs.user_id, bs.tier, bs.provider, bs.billing_period_start, bs.billing_period_end,
    row_number() over (partition by bs.user_id
      order by case bs.tier when 'pro' then 2 when 'premium' then 1 else 0 end desc,
               bs.billing_period_end desc nulls first,
               bs.updated_at desc nulls last, bs.created_at desc nulls last) as rn
  from public.billing_subscriptions bs
  join public.users u on u.id = bs.user_id
  where bs.is_paid = true and lower(bs.status) = 'active' and bs.cancelled_at is null
    and bs.tier in ('premium','pro')
    and (bs.billing_period_end is null or bs.billing_period_end > now())
)
insert into public.user_subscriptions (user_id, tier, is_active, payment_provider, started_at, renews_at, cancelled_at, updated_at)
select user_id, tier, true, provider, coalesce(billing_period_start, now()), billing_period_end, null, now()
from active_paid_billing where rn = 1
on conflict (user_id) do update set
  tier             = excluded.tier,
  is_active        = true,
  payment_provider = excluded.payment_provider,
  started_at       = coalesce(public.user_subscriptions.started_at, excluded.started_at),
  renews_at        = excluded.renews_at,
  cancelled_at     = null,
  updated_at       = now();

-- Fix is_active for cancelled subscriptions (was incorrectly set to true before fix)
update public.user_subscriptions
set is_active = false, updated_at = now()
where cancelled_at is not null and is_active = true;

-- Rebuild users.subscription_tier from current active access
with current_access as (
  select distinct on (us.user_id) us.user_id, us.tier
  from public.user_subscriptions us
  where us.tier in ('premium','pro') and us.is_active = true
    and us.cancelled_at is null and (us.renews_at is null or us.renews_at > now())
  order by us.user_id,
    case us.tier when 'pro' then 2 when 'premium' then 1 else 0 end desc,
    us.updated_at desc nulls last, us.created_at desc nulls last
),
resolved as (
  select u.id, coalesce(ca.tier, 'free') as current_tier
  from public.users u left join current_access ca on ca.user_id = u.id
)
update public.users u
set subscription_tier = resolved.current_tier, updated_at = now()
from resolved
where resolved.id = u.id and u.subscription_tier is distinct from resolved.current_tier;

-- ============================================================
-- DONE
-- Run schema_audit.sql to verify, then check /health endpoint.
-- ============================================================

commit;
