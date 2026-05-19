#!/usr/bin/env node
const { Pool } = require('pg');
const crypto = require('crypto');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

function randSuffix() { return crypto.randomBytes(4).toString('hex'); }

(async () => {
  const adminPool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const roleName = `rls_tester_${randSuffix()}`;
  const rolePass = `TmpPass!${randSuffix()}`;

  console.log('Creating temporary role for RLS test:', roleName);

  try {
    const adminClient = await adminPool.connect();

    // Derive project ref from admin user (e.g. 'postgres.<projectRef>') so the
    // pooler can route the temporary login to the correct tenant. If present,
    // create a role named like: `${roleName}.${projectRef}` (quoted when used).
    const adminUserMatch = connectionString.match(/^postgresql:\/\/([^:]+):/);
    const adminUser = adminUserMatch ? adminUserMatch[1] : null;
    const projectRef = adminUser && adminUser.includes('.') ? adminUser.split('.')[1] : null;
    const fullRole = projectRef ? `${roleName}.${projectRef}` : roleName;

    // create role (quote identifier since it may contain a dot)
    await adminClient.query(`DROP ROLE IF EXISTS "${fullRole}"`);
    await adminClient.query(`CREATE ROLE "${fullRole}" LOGIN PASSWORD '${rolePass}'`);
    await adminClient.query(`GRANT CONNECT ON DATABASE postgres TO "${fullRole}"`);
    await adminClient.query(`GRANT USAGE ON SCHEMA public TO "${fullRole}"`);
    await adminClient.query(`GRANT SELECT ON public.user_daily_roadmap TO "${fullRole}"`);

    console.log('Temporary role created. Connecting as that role...');

    // Safely construct a connection string for the temporary role.
    // The original connectionString may contain `@` characters in the password,
    // so replace the credentials by inserting the new user:pass before the
    // last `@` (which separates credentials from host). Percent-encode the
    // password to be safe.
    const protoSep = '://';
    const protoIndex = connectionString.indexOf(protoSep);
    const lastAt = connectionString.lastIndexOf('@');
    let testConn;
    if (lastAt === -1 || protoIndex === -1) {
      // Fallback to a simple replace if the string is unexpected
      testConn = connectionString.replace('postgresql://', `postgresql://${fullRole}:${encodeURIComponent(rolePass)}@`);
    } else {
      const suffix = connectionString.substring(lastAt + 1); // host:port/... remainder
      const prefix = connectionString.substring(0, protoIndex + protoSep.length); // e.g. 'postgresql://'
      testConn = `${prefix}${fullRole}:${encodeURIComponent(rolePass)}@${suffix}`;
    }

    const testPool = new Pool({ connectionString: testConn, ssl: { rejectUnauthorized: false } });
    const testClient = await testPool.connect();

    try {
      // Without any jwt claim set
      const base = await testClient.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
      console.log('\nAs role without JWT claim, visible rows:', base.rows[0].cnt);

      const sample = await adminClient.query('SELECT DISTINCT user_id FROM public.user_daily_roadmap LIMIT 3');
      const uids = sample.rows.map(r => r.user_id);
      if (uids.length === 0) {
        console.log('No user ids present to test. Exiting.');
        return;
      }

      for (const uid of uids) {
        console.log(`\nSetting jwt.claims.sub = ${uid}`);
        await testClient.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [uid]);
        const visible = await testClient.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
        const whereCount = await testClient.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap WHERE user_id = $1', [uid]);
        console.log(`Visible rows for session auth.uid=${uid}: ${visible.rows[0].cnt}`);
        console.log(`Rows matching WHERE user_id=${uid}: ${whereCount.rows[0].cnt}`);
      }

      const other = '00000000-0000-0000-0000-000000000000';
      console.log(`\nSetting jwt.claims.sub = ${other} (random other user)`);
      await testClient.query(`SELECT set_config('request.jwt.claims.sub', $1, true)`, [other]);
      const visibleOther = await testClient.query('SELECT count(*)::bigint AS cnt FROM public.user_daily_roadmap');
      console.log(`Visible rows for random other user: ${visibleOther.rows[0].cnt}`);

      await testClient.release();
      await testPool.end();
    } finally {
      // cleanup: drop the temporary role
      console.log('\nCleaning up: dropping temporary role...');
      await adminClient.query(`DROP ROLE IF EXISTS "${fullRole}"`);
      await adminClient.release();
      await adminPool.end();
      console.log('Cleanup complete.');
    }
  } catch (err) {
    console.error('rls_full_test failed:', err && err.message ? err.message : err);
    try { await adminPool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
