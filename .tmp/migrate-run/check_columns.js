#!/usr/bin/env node
const { Client } = require('pg');
const dbUrl = process.argv[2] || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Usage: node check_columns.js <DATABASE_URL>');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('food_logs','saved_meals') ORDER BY table_name, ordinal_position");
    const map = {};
    for (const r of res.rows) {
      map[r.table_name] = map[r.table_name] || [];
      map[r.table_name].push(`${r.column_name} (${r.data_type})`);
    }
    for (const t of Object.keys(map)) {
      console.log('\nTable:', t);
      map[t].forEach(c => console.log('  -', c));
    }
  } catch (err) {
    console.error('Error checking columns:', err.message || err);
    process.exit(1);
  } finally {
    try { await client.end(); } catch (e) {}
  }
})();
