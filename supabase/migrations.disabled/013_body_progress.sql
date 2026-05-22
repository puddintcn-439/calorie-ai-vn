-- Body progress tracking: weight, measurements, body composition
-- Allows users to track physical changes over time

CREATE TABLE IF NOT EXISTS body_progress (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at   DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Weight
  weight_kg     NUMERIC(5,2),

  -- Body measurements (cm)
  waist_cm      NUMERIC(5,1),
  hip_cm        NUMERIC(5,1),
  chest_cm      NUMERIC(5,1),
  arm_cm        NUMERIC(5,1),
  thigh_cm      NUMERIC(5,1),

  -- Optional body composition
  body_fat_pct  NUMERIC(4,1),
  muscle_mass_kg NUMERIC(5,2),

  -- Notes / mood
  note          TEXT,
  energy_level  SMALLINT CHECK (energy_level BETWEEN 1 AND 5), -- 1=low, 5=high

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One record per day per user
CREATE UNIQUE INDEX IF NOT EXISTS body_progress_user_date
  ON body_progress (user_id, recorded_at);

-- Index for chronological retrieval
CREATE INDEX IF NOT EXISTS body_progress_user_recent
  ON body_progress (user_id, recorded_at DESC);

-- RLS
ALTER TABLE body_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS body_progress_select ON body_progress;
CREATE POLICY body_progress_select ON body_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS body_progress_insert ON body_progress;
CREATE POLICY body_progress_insert ON body_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS body_progress_update ON body_progress;
CREATE POLICY body_progress_update ON body_progress
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS body_progress_delete ON body_progress;
CREATE POLICY body_progress_delete ON body_progress
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_body_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER body_progress_updated_at
  BEFORE UPDATE ON body_progress
  FOR EACH ROW EXECUTE FUNCTION update_body_progress_updated_at();
