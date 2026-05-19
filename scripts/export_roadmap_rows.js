#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    const res = await client.query(`
      SELECT id, user_id, logged_date, task_id, task_title, activity_type, duration_min, estimated_kcal, is_custom, is_removed, is_completed, created_at
      FROM public.user_daily_roadmap
      ORDER BY created_at DESC
      LIMIT 20
    `);

    if (!res.rows || res.rows.length === 0) {
      console.log('No rows found in user_daily_roadmap');
    } else {
      console.log(`Found ${res.rows.length} rows:`);
      console.table(res.rows);
    }

    client.release();
  } catch (err) {
    console.error('Error exporting rows:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
