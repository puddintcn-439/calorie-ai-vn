#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'rls_tester_%' OR rolname LIKE 'rls_sim_%'");
    if (!res.rows.length) {
      console.log('No temporary RLS roles found.');
      client.release();
      await pool.end();
      return;
    }

    console.log('Found temp roles:', res.rows.map(r => r.rolname));
    for (const { rolname } of res.rows) {
      if (rolname === 'postgres') continue;
      console.log('\nProcessing role:', rolname);
      try {
        console.log('DROP OWNED BY', rolname, 'CASCADE');
        await client.query(`DROP OWNED BY "${rolname}" CASCADE`);
      } catch (e) {
        console.warn('DROP OWNED failed:', e && e.message ? e.message : e);
      }
      try {
        await client.query(`REASSIGN OWNED BY "${rolname}" TO postgres`);
      } catch (e) {}
      try {
        await client.query(`REVOKE "${rolname}" FROM postgres`);
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
    console.error('Cascade drop failed:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
