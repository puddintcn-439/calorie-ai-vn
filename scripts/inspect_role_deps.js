#!/usr/bin/env node
const { Pool } = require('pg');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();
const rolesToInspect = process.argv.slice(2);

(async () => {
  if (rolesToInspect.length === 0) {
    console.log('Usage: node inspect_role_deps.js <rolename> [rolename2 ...]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    for (const r of rolesToInspect) {
      console.log('\n--- Inspecting role:', r, '---');
      const oidRes = await client.query('SELECT oid FROM pg_roles WHERE rolname = $1', [r]);
      if (!oidRes.rows.length) { console.log('Role not found:', r); continue; }
      const oid = oidRes.rows[0].oid;

      const rels = await client.query(`SELECT n.nspname, c.relname, c.relkind
        FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relowner = $1`, [oid]);
      console.log('Owned relations:', rels.rows.length ? rels.rows : 'none');

      const procs = await client.query(`SELECT n.nspname, p.proname
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proowner = $1`, [oid]);
      console.log('Owned functions:', procs.rows.length ? procs.rows : 'none');

      const types = await client.query(`SELECT n.nspname, t.typname
        FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typowner = $1`, [oid]);
      console.log('Owned types:', types.rows.length ? types.rows : 'none');

      const schemas = await client.query(`SELECT n.nspname FROM pg_namespace n WHERE n.nspowner = $1`, [oid]);
      console.log('Owned schemas:', schemas.rows.length ? schemas.rows : 'none');

      const authm = await client.query(`SELECT roleid::regrole::text AS role, member::regrole::text AS member FROM pg_auth_members WHERE roleid = $1 OR member = $1`, [oid]);
      console.log('Auth membership rows:', authm.rows.length ? authm.rows : 'none');

      const defacl = await client.query(`SELECT * FROM pg_default_acl WHERE defaclrole = $1`, [oid]);
      console.log('Default ACL entries:', defacl.rows.length ? defacl.rows : 'none');

      const dep = await client.query(`SELECT classid::regclass::text AS class, objid, deptype FROM pg_depend WHERE refobjid = $1`, [oid]);
      console.log('pg_depend referencing role:', dep.rows.length ? dep.rows : 'none');
    }
    client.release();
    await pool.end();
  } catch (err) {
    console.error('Inspect failed:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (e) {}
    process.exitCode = 1;
  }
})();
