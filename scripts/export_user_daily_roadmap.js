#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { getSupabaseDbUrl } = require('./lib/env');

const connectionString = getSupabaseDbUrl();

(async () => {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    const res = await client.query(`SELECT * FROM public.user_daily_roadmap ORDER BY created_at DESC LIMIT 100`);
    const outDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `user_daily_roadmap_sample_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(res.rows, null, 2));
    console.log(`Wrote ${res.rows.length} rows to ${file}`);

    client.release();
  } catch (err) {
    console.error('Export failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
