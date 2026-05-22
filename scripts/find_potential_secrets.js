#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE = new Set([
  'node_modules',
  '.git',
  '.github/workflows',
  'coverage',
  'dist',
  'tmp',
  'apps/backend/logs',
]);

const envNames = [
  'GEMINI_API_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_URL',
  'SUPABASE_DB_URL',
  'JWT_SECRET',
  'SENTRY_DSN',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
];

const regexes = [
  { name: 'Google API Key (AIza...)', re: /AIza[0-9A-Za-z_\-]{35}/g },
  { name: 'AWS Access Key ID (AKIA...)', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Private key header', re: /-----BEGIN (RSA |PRIVATE)KEY-----/g },
  { name: 'JWT-like token', re: /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g },
];

function mask(v) {
  if (!v) return v;
  if (v.length <= 10) return v;
  return `${v.slice(0, 6)}...${v.slice(-6)}`;
}

function isBinary(buffer) {
  for (let i = 0; i < Math.min(buffer.length, 512); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

const findings = [];

function scanFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return;
    if (stat.size > 1024 * 1024) return; // skip >1MB files

    // skip example files (they often contain placeholder values)
    const rel = path.relative(ROOT, filePath);
    if (rel.includes('.example')) return;

    const raw = fs.readFileSync(filePath);
    if (isBinary(raw)) return;
    const content = raw.toString('utf8');

    // check env assignments for known names
    for (const name of envNames) {
      const re = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'im');
      const m = content.match(re);
      if (m && m[1]) {
        const val = m[1].trim();
        if (val && !/change|example|dev|placeholder|REPLACE_ME/i.test(val)) {
          findings.push({ file: filePath, type: `ENV ${name}`, value: mask(val) });
        }
      }
    }

    // check regex patterns
    for (const p of regexes) {
      const m = content.match(p.re);
      if (m && m.length) {
        for (const hit of m.slice(0, 5)) {
          findings.push({ file: filePath, type: p.name, value: mask(hit) });
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    if (IGNORE.has(e)) continue;
    const full = path.join(dir, e);
    let stat;
    try { stat = fs.statSync(full); } catch (err) { continue; }
    if (stat.isDirectory()) {
      walk(full);
    } else {
      scanFile(full);
    }
  }
}

walk(ROOT);

if (findings.length) {
  console.error('Potential secrets found:');
  for (const f of findings) {
    console.error(`- ${f.type} in ${path.relative(ROOT, f.file)} -> ${f.value}`);
  }
  process.exit(1);
} else {
  console.log('No obvious secrets found.');
  process.exit(0);
}
