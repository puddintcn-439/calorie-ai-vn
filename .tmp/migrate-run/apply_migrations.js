#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.argv[2] || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Usage: node apply_migrations.js <DATABASE_URL>');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error('Migrations directory not found:', migrationsDir);
      process.exit(1);
    }
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log('\n--- Applying', file);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✅ Applied', file);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) {}
        const msg = String(err.message || err).toLowerCase();
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('exists')) {
          console.warn('⚠️ Skipping', file, 'because:', err.message || err);
          continue;
        }
        console.error('❌ Failed', file, err.message || err);
        throw err;
      }
    }
    console.log('\nAll migrations applied successfully');
  } catch (err) {
    console.error('Migration runner error:', err.message || err);
    process.exit(1);
  } finally {
    try { await client.end(); } catch (e) {}
  }
})();
