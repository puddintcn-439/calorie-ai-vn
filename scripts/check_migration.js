#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    const cols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_daily_roadmap'
       ORDER BY ordinal_position`
    );
    console.log('\nColumns:');
    console.table(cols.rows);

    const idx = await client.query(
      `SELECT c2.relname as index_name, pg_get_indexdef(i.indexrelid) as index_def
       FROM pg_catalog.pg_index i
       JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
       JOIN pg_catalog.pg_class c2 ON c2.oid = i.indexrelid
       WHERE c.relname = 'user_daily_roadmap'`
    );
    console.log('\nIndexes:');
    console.table(idx.rows);

    const policies = await client.query(
      `SELECT p.polname as policy_name, p.polcmd as command, pg_get_expr(p.polqual, p.polrelid) as qual, pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
       FROM pg_policy p
       JOIN pg_class c ON p.polrelid = c.oid
       WHERE c.relname = 'user_daily_roadmap'`
    );
    console.log('\nPolicies:');
    console.table(policies.rows);

    const rls = await client.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='user_daily_roadmap'`);
    console.log('\nRLS:');
    console.log(rls.rows[0] || {});

    const cnt = await client.query(`SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap`);
    console.log('\nRow count:', cnt.rows[0].cnt);

    client.release();
  } catch (err) {
    console.error('Error checking migration:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
