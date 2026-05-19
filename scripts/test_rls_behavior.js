#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    const allCount = await client.query(`SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap`);
    console.log('\nTotal rows visible to this session:', allCount.rows[0].cnt);

    const rowsRes = await client.query(`SELECT id, user_id, created_at FROM public.user_daily_roadmap ORDER BY created_at DESC LIMIT 20`);
    const rows = rowsRes.rows;
    if (!rows || rows.length === 0) {
      console.log('No sample rows to test RLS');
      client.release();
      return;
    }

    console.log('\nSample rows (id, user_id):');
    console.table(rows.map(r => ({ id: r.id, user_id: r.user_id, created_at: r.created_at })));

    const uniqueUserIds = Array.from(new Set(rows.map(r => r.user_id))).slice(0, 3);
    for (const uid of uniqueUserIds) {
      console.log(`\n--- Testing as user: ${uid} ---`);
      await client.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [uid]);
      const visible = await client.query(`SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap`);
      const visibleForUid = await client.query(`SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap WHERE user_id = $1`, [uid]);
      console.log(`Visible rows (session auth.uid=${uid}): ${visible.rows[0].cnt}`);
      console.log(`Rows matching WHERE user_id=${uid}: ${visibleForUid.rows[0].cnt}`);
    }

    // Test a random different user
    const other = '00000000-0000-0000-0000-000000000000';
    console.log(`\n--- Testing as random other user: ${other} ---`);
    await client.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [other]);
    const visibleOther = await client.query(`SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap`);
    console.log(`Visible rows (session auth.uid=${other}): ${visibleOther.rows[0].cnt}`);

    // Cleanup: clear the claim
    await client.query(`SELECT set_config('request.jwt.claims.sub', '', true)`);
    client.release();
  } catch (err) {
    console.error('RLS test failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
