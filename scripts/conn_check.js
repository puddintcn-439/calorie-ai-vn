#!/usr/bin/env node
const { Client } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const cs = process.argv[2] || getSupabaseDbUrl();

const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await client.connect();
    const r1 = await client.query('SELECT current_user, session_user');
    const current = r1.rows[0] || {};
    console.log('CURRENT_USER:', current.current_user);
    console.log('SESSION_USER:', current.session_user);

    const roleInfo = await client.query("SELECT rolsuper, rolname FROM pg_roles WHERE rolname = current_user");
    if (roleInfo.rows.length) console.log('ROLE_SUPERUSER:', roleInfo.rows[0].rolsuper);

    const isSupabaseAdminMember = await client.query("SELECT pg_has_role(current_user, 'supabase_admin', 'member') AS is_member");
    console.log('IS_MEMBER_supabase_admin:', isSupabaseAdminMember.rows[0].is_member);

    const memberships = await client.query("SELECT roleid::regrole::text AS role FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)");
    console.log('MEMBER_OF_ROLES:', memberships.rows.map(r => r.role).join(', ') || '<none>');

    const rolesuperList = await client.query("SELECT rolname FROM pg_roles WHERE rolsuper = true");
    console.log('SUPERUSERS:', rolesuperList.rows.map(r => r.rolname).join(', '));

    await client.end();
  } catch (err) {
    console.error('ERROR:', err.message || err);
    try { await client.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
