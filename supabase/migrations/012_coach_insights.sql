-- Coach insights and behavioral patterns
CREATE TABLE user_behavioral_patterns (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'stress_eating',      -- Eating significantly more on high-stress days
    'skipped_meals',      -- Regularly skipping meals
    'binge_episodes',     -- Sudden high-calorie spikes
    'timing_preference',  -- Prefers eating at specific times
    'weekend_variance',   -- Different eating on weekends vs weekdays
    'emotional_trigger',  -- Links food to emotions
    'night_eating',       -- Eating late hours
    'inconsistent_logging' -- Logs inconsistently
  )),
  severity_level INTEGER CHECK (severity_level BETWEEN 1 AND 5),
  -- 1=minimal, 2=mild, 3=moderate, 4=significant, 5=critical
  
  first_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  frequency_score DECIMAL(3,2), -- 0-1, how often this pattern occurs
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coaching insights generated for user
CREATE TABLE user_coaching_insights (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'pattern_alert',      -- Detected behavioral pattern
    'achievement',        -- Positive achievement (streak, consistency)
    'opportunity',        -- Suggestion for improvement
    'warning',            -- Concerning trend
    'personalized_advice' -- Custom coaching tip
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action_suggestion TEXT, -- "Try logging 15 min after each meal" etc
  impact_score INTEGER, -- 1-10, estimated impact on success
  
  -- Context
  pattern_id BIGINT REFERENCES user_behavioral_patterns(id),
  affected_meal_type TEXT, -- "breakfast", "lunch", "dinner", "snack", or NULL for all
  
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Insights become stale after time
  
  CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Weekly coaching summary
CREATE TABLE user_coaching_summaries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  
  -- 7-day stats
  logs_count INTEGER,
  adherence_percentage INTEGER, -- 0-100
  consistency_score DECIMAL(3,2), -- 0-1, how consistent vs goal
  
  -- Patterns detected this week
  primary_pattern TEXT, -- Most significant pattern detected
  secondary_patterns TEXT[], -- Array of other patterns
  
  -- Insights generated
  insights_generated INTEGER,
  
  -- Metrics
  total_calories DECIMAL(10,2),
  average_daily_calories DECIMAL(10,2),
  calorie_variance DECIMAL(10,2), -- std deviation
  
  -- Performance vs goal
  days_above_target INTEGER,
  days_below_target INTEGER,
  days_on_target INTEGER,
  
  -- Coaching recommendation
  recommended_action TEXT,
  priority_level TEXT CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_patterns_user_type ON user_behavioral_patterns(user_id, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_detected_at ON user_behavioral_patterns(user_id, last_detected_at);
CREATE INDEX IF NOT EXISTS idx_insights_user_type ON user_coaching_insights(user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_created ON user_coaching_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_user_week ON user_coaching_summaries(user_id, week_start_date DESC);

-- RLS policies for security
ALTER TABLE user_behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coaching_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coaching_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own patterns" ON user_behavioral_patterns;
CREATE POLICY "Users can view own patterns"
  ON user_behavioral_patterns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own insights" ON user_coaching_insights;
CREATE POLICY "Users can view own insights"
  ON user_coaching_insights FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can acknowledge insights" ON user_coaching_insights;
CREATE POLICY "Users can acknowledge insights"
  ON user_coaching_insights FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own summaries" ON user_coaching_summaries;
CREATE POLICY "Users can view own summaries"
  ON user_coaching_summaries FOR SELECT
  USING (auth.uid() = user_id);
