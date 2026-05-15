#!/usr/bin/env node
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.ymtdrtmmqyhjvhrjyuoo:DKMvkl@4399@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB — listing temp RLS roles');

    const res = await client.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'rls_sim_%' OR rolname LIKE 'rls_tester_%'");
    if (!res.rows || res.rows.length === 0) {
      console.log('No temporary RLS roles found.');
      client.release();
      await pool.end();
      return;
    }

    console.log('Found temporary roles:', res.rows.map(r => r.rolname));
    const curRes = await client.query('SELECT current_user');
    const currentUser = curRes.rows[0].current_user;

    for (const row of res.rows) {
      const r = row.rolname;
      console.log('\nCleaning role:', r);
      try { await client.query(`REVOKE "${r}" FROM "${currentUser}"`); } catch (e) {}
      try { await client.query(`REVOKE SELECT ON public.user_daily_roadmap FROM "${r}"`); } catch (e) {}
      try { await client.query(`REVOKE USAGE ON SCHEMA public FROM "${r}"`); } catch (e) {}
      try { await client.query(`REASSIGN OWNED BY "${r}" TO "${currentUser}"`); } catch (e) {}
      try {
        await client.query(`DROP ROLE IF EXISTS "${r}"`);
        console.log('Dropped', r);
      } catch (e) {
        console.warn('Failed to drop', r, e && e.message ? e.message : e);
      }
    }

    client.release();
    await pool.end();
  } catch (err) {
    console.error('Cleanup failed:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
