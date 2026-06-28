alter table if exists public.users
  add column if not exists pregnancy_trimester smallint,
  add column if not exists breastfeeding_level text,
  add column if not exists diabetes_type text,
  add column if not exists kidney_care_status text,
  add column if not exists athlete_level text,
  add column if not exists clinician_nutrition_targets jsonb;

alter table if exists public.users
  drop constraint if exists users_pregnancy_trimester_range,
  add constraint users_pregnancy_trimester_range
    check (pregnancy_trimester is null or pregnancy_trimester between 1 and 3),
  drop constraint if exists users_breastfeeding_level_allowed,
  add constraint users_breastfeeding_level_allowed
    check (breastfeeding_level is null or breastfeeding_level in ('exclusive', 'partial')),
  drop constraint if exists users_diabetes_type_allowed,
  add constraint users_diabetes_type_allowed
    check (diabetes_type is null or diabetes_type in ('type_1', 'type_2', 'gestational')),
  drop constraint if exists users_kidney_care_status_allowed,
  add constraint users_kidney_care_status_allowed
    check (kidney_care_status is null or kidney_care_status in ('not_on_dialysis', 'hemodialysis', 'peritoneal_dialysis', 'unknown')),
  drop constraint if exists users_athlete_level_allowed,
  add constraint users_athlete_level_allowed
    check (athlete_level is null or athlete_level in ('recreational', 'competitive', 'elite')),
  drop constraint if exists users_clinician_targets_object,
  add constraint users_clinician_targets_object
    check (clinician_nutrition_targets is null or jsonb_typeof(clinician_nutrition_targets) = 'object');
