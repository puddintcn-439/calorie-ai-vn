#!/usr/bin/env node

/**
 * Create the minimal schema required by local/CI smoke tests.
 *
 * This is intentionally not a production migration runner. Production
 * Supabase changes must be applied from reviewed SQL migration files.
 */

const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString });

  try {
    console.log('Connecting to smoke-test PostgreSQL...');
    const client = await pool.connect();

    console.log('Connected successfully');
    console.log('Creating minimal smoke-test schema...');

    await client.query('CREATE TABLE IF NOT EXISTS public.users (id uuid primary key);');
    await client.query(`
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
    `);

    try {
      await client.query('ALTER TABLE public.user_daily_roadmap ENABLE ROW LEVEL SECURITY;');
      await client.query('DROP POLICY IF EXISTS "Users manage own roadmap" ON public.user_daily_roadmap;');
      await client.query(`
        CREATE POLICY "Users manage own roadmap"
          ON public.user_daily_roadmap FOR ALL
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      `);
    } catch (error) {
      console.warn('Skipping Supabase-specific RLS policy:', error.message);
    }

    await client.query('CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_date ON public.user_daily_roadmap (user_id, logged_date);');
    await client.query('CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_task ON public.user_daily_roadmap (user_id, task_id);');

    console.log('Smoke-test schema bootstrap completed.');
    client.release();
  } catch (error) {
    console.error('Smoke-test schema bootstrap failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
