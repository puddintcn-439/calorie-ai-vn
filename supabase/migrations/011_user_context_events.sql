-- Create user_context_events table for tracking life context activations
-- Captures when users enable/disable stress, period, travel, busy work, etc.

CREATE TABLE IF NOT EXISTS user_context_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_mode VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('activated', 'deactivated')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT NULL
);

-- Indexes for common queries
CREATE INDEX idx_user_context_events_user_id ON user_context_events(user_id);
CREATE INDEX idx_user_context_events_created_at ON user_context_events(created_at DESC);
CREATE INDEX idx_user_context_events_context_mode ON user_context_events(context_mode);

-- Row Level Security
ALTER TABLE user_context_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own context events" ON user_context_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own context events" ON user_context_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
