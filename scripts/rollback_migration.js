#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    console.log('Dropping table public.user_daily_roadmap (CASCADE)');
    await client.query('DROP TABLE IF EXISTS public.user_daily_roadmap CASCADE');
    console.log('Dropped table (if existed)');

    client.release();
  } catch (err) {
    console.error('Rollback failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
