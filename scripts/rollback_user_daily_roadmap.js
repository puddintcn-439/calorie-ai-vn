#!/usr/bin/env node
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.ymtdrtmmqyhjvhrjyuoo:DKMvkl@4399@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';

const FORCE = process.env.CONFIRM === '1' || process.argv.includes('--force');

const SQL = `DROP TABLE IF EXISTS public.user_daily_roadmap CASCADE;`;

(async () => {
  console.log('Rollback helper for user_daily_roadmap migration');
  if (!FORCE) {
    console.log('\nDry-run: the following SQL will be executed if you run with CONFIRM=1 or --force:');
    console.log('\n' + SQL + '\n');
    console.log('Run with: CONFIRM=1 node scripts/rollback_user_daily_roadmap.js');
    process.exit(0);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB — executing rollback...');
    await client.query(SQL);
    console.log('Rollback executed: table dropped (CASCADE).');
    client.release();
  } catch (err) {
    console.error('Rollback failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
