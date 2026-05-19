-- Ensure coaching pattern upserts can target (user_id, pattern_type).
-- Migration 012 originally created a non-unique index, which is not enough for
-- Supabase/Postgres ON CONFLICT inference.

WITH ranked_patterns AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id, pattern_type
      ORDER BY
        last_detected_at DESC NULLS LAST,
        severity_level DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        id DESC
    ) AS survivor_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, pattern_type
      ORDER BY
        last_detected_at DESC NULLS LAST,
        severity_level DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        id DESC
    ) AS row_num
  FROM public.user_behavioral_patterns
),
remapped_insights AS (
  UPDATE public.user_coaching_insights insight
  SET pattern_id = ranked_patterns.survivor_id
  FROM ranked_patterns
  WHERE ranked_patterns.row_num > 1
    AND insight.pattern_id = ranked_patterns.id
  RETURNING insight.id
)
DELETE FROM public.user_behavioral_patterns pattern
USING ranked_patterns
WHERE ranked_patterns.row_num > 1
  AND pattern.id = ranked_patterns.id;

DROP INDEX IF EXISTS public.idx_patterns_user_type;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_behavioral_patterns_user_pattern_type_key'
      AND conrelid = 'public.user_behavioral_patterns'::regclass
  ) THEN
    ALTER TABLE public.user_behavioral_patterns
      ADD CONSTRAINT user_behavioral_patterns_user_pattern_type_key
      UNIQUE (user_id, pattern_type);
  END IF;
END $$;
