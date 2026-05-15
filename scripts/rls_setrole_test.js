#!/usr/bin/env node
const { Pool } = require('pg');
const crypto = require('crypto');

const connectionString = 'postgresql://postgres.ymtdrtmmqyhjvhrjyuoo:DKMvkl@4399@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';

function randSuffix() { return crypto.randomBytes(4).toString('hex'); }

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const roleName = `rls_sim_${randSuffix()}`;

  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    // allow passing sample user_ids via command-line args for deterministic runs
    let adminUids = process.argv.slice(2);
    if (adminUids.length === 0) {
      const adminSampleRes = await client.query('SELECT DISTINCT user_id FROM public.user_daily_roadmap LIMIT 3');
      adminUids = adminSampleRes.rows.map(r => r.user_id);
    }
    console.log('Sample user_ids to test (admin):', adminUids);

    console.log('Creating temporary non-login role:', roleName);
    await client.query(`CREATE ROLE "${roleName}" NOLOGIN`);
    await client.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
    await client.query(`GRANT SELECT ON public.user_daily_roadmap TO "${roleName}"`);

    const curUserRes = await client.query('SELECT current_user');
    const currentUser = curUserRes.rows[0].current_user;
    console.log('Current session user:', currentUser);
    console.log('Granting temporary role to current user so SET ROLE is permitted');
    await client.query(`GRANT "${roleName}" TO "${currentUser}"`);

    console.log('Switching to temporary role in-session (SET ROLE)');
    await client.query(`SET ROLE "${roleName}"`);
    const cur = await client.query(`SELECT current_user`);
    console.log('Current user after SET ROLE:', cur.rows[0].current_user);

    // Without jwt claim
    await client.query(`SELECT set_config('request.jwt.claims.sub', '', true)`);
    const base = await client.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
    console.log('\nVisible rows with no claim (as role):', base.rows[0].cnt);

    const uids = adminUids;
    if (uids.length === 0) {
      console.log('No user ids to test; cleaning up.');
      await client.query('RESET ROLE');
      try { await client.query(`REVOKE "${roleName}" FROM "${currentUser}"`); } catch (e) {}
      try { await client.query(`REVOKE SELECT ON public.user_daily_roadmap FROM "${roleName}"`); } catch (e) {}
      try { await client.query(`REVOKE USAGE ON SCHEMA public FROM "${roleName}"`); } catch (e) {}
      try { await client.query(`REASSIGN OWNED BY "${roleName}" TO "${currentUser}"`); } catch (e) {}
      try { await client.query(`DROP ROLE IF EXISTS "${roleName}"`); } catch (e) {}
      client.release();
      await pool.end();
      return;
    }

    for (const uid of uids) {
      console.log(`\nSetting jwt.claims.sub = ${uid}`);
      await client.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [uid]);
      const visible = await client.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
      const whereCount = await client.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap WHERE user_id = $1', [uid]);
      console.log(`Visible rows for session auth.uid=${uid}: ${visible.rows[0].cnt}`);
      console.log(`Rows matching WHERE user_id=${uid}: ${whereCount.rows[0].cnt}`);
    }

    const other = '00000000-0000-0000-0000-000000000000';
    console.log(`\nSetting jwt.claims.sub = ${other} (random other user)`);
    await client.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [other]);
    const visibleOther = await client.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
    console.log(`Visible rows for random other user: ${visibleOther.rows[0].cnt}`);

    // Reset role and cleanup
    console.log('\nResetting role and dropping temporary role...');
    await client.query('RESET ROLE');
    try { await client.query(`REVOKE "${roleName}" FROM "${currentUser}"`); } catch (e) {}
    try { await client.query(`REVOKE SELECT ON public.user_daily_roadmap FROM "${roleName}"`); } catch (e) {}
    try { await client.query(`REVOKE USAGE ON SCHEMA public FROM "${roleName}"`); } catch (e) {}
    try { await client.query(`REASSIGN OWNED BY "${roleName}" TO "${currentUser}"`); } catch (e) {}
    try { await client.query(`DROP ROLE IF EXISTS "${roleName}"`); } catch (e) { console.warn('Drop role failed, leaving role for manual cleanup'); }
    client.release();
    await pool.end();
    console.log('RLS SET ROLE test complete.');
  } catch (err) {
    console.error('RLS SET ROLE test failed:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
