#!/usr/bin/env node

/**
 * Direct database migration runner using PostgreSQL connection string
 */

const { Pool } = require('pg');
const fs = require('fs');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

const migrationSQL = `
CREATE TABLE IF NOT EXISTS public.user_daily_roadmap (
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

ALTER TABLE public.user_daily_roadmap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own roadmap" ON public.user_daily_roadmap;
CREATE POLICY "Users manage own roadmap"
  ON public.user_daily_roadmap FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_date ON public.user_daily_roadmap (user_id, logged_date);
CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_task ON public.user_daily_roadmap (user_id, task_id);
`;

(async () => {
  const pool = new Pool({ connectionString });

  try {
    console.log('🔗 Connecting to Supabase database...');
    const client = await pool.connect();
    
    console.log('✓ Connected successfully');
    console.log('🚀 Running migration...');
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('✓ Table user_daily_roadmap created');
    console.log('✓ RLS enabled');
    console.log('✓ Security policy configured');
    console.log('✓ Indexes created');
    
    client.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
