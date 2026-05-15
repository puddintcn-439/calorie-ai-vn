#!/usr/bin/env node
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.ymtdrtmmqyhjvhrjyuoo:DKMvkl@4399@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'rls_tester_%'");
    if (!res.rows.length) { console.log('No rls_tester roles found'); client.release(); await pool.end(); return; }
    for (const { rolname } of res.rows) {
      console.log('Forcing drop of', rolname);
      try {
        await client.query(`REVOKE "${rolname}" FROM postgres`);
      } catch (e) { console.warn('Revoke failed (may be ok):', e && e.message ? e.message : e); }
      try {
        await client.query(`REASSIGN OWNED BY "${rolname}" TO postgres`);
      } catch (e) {}
      try {
        await client.query(`DROP ROLE IF EXISTS "${rolname}"`);
        console.log('Dropped', rolname);
      } catch (e) {
        console.warn('Failed to drop', rolname, e && e.message ? e.message : e);
      }
    }
    client.release();
    await pool.end();
  } catch (err) {
    console.error('Force drop failed:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
