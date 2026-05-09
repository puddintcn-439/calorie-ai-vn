-- ==========================================
-- CANONICAL FOOD SCHEMA: Source lineage, quality signals, and sync tracking
-- ==========================================

-- 1. Source lineage fields
alter table public.foods
  add column if not exists source_id          text,
  add column if not exists source_url         text,
  add column if not exists source_data_hash   text,
  add column if not exists barcode            text;

-- 2. Quality signals
alter table public.foods
  add column if not exists nutrient_confidence  numeric(4,3) check (nutrient_confidence between 0 and 1),
  add column if not exists is_validated         boolean not null default false,
  add column if not exists has_impossible_values boolean not null default false;

-- 3. Sync tracking
alter table public.foods
  add column if not exists last_synced_at  timestamptz;

-- 4. Unique constraint: one record per (source, external_id)
--    Skip USDA/OFF duplicates during delta sync
create unique index if not exists foods_source_source_id_uidx
  on public.foods (source, source_id)
  where source_id is not null;

-- 5. Unique constraint on barcode for fast barcode lookup
create unique index if not exists foods_barcode_uidx
  on public.foods (barcode)
  where barcode is not null;

-- 6. Index for full-text search upgrade (already exists but make sure it covers barcode)
create index if not exists foods_barcode_idx on public.foods (barcode);

-- 7. Recalculate nutrient_confidence for existing seed data (all custom_vn, mark 0.80)
update public.foods
set nutrient_confidence = 0.80,
    is_validated        = true
where source = 'custom_vn'
  and nutrient_confidence is null;
