function requireEnv(name, aliases = []) {
  const names = [name, ...aliases];
  for (const key of names) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }

  console.error(`Missing required environment variable: ${name}`);
  if (aliases.length > 0) {
    console.error(`Also accepted: ${aliases.join(', ')}`);
  }
  process.exit(2);
}

function getSupabaseDbUrl() {
  return requireEnv('SUPABASE_DB_URL', ['DATABASE_URL']);
}

function getSupabaseUrl() {
  return requireEnv('SUPABASE_URL');
}

function getSupabaseServiceKey() {
  return requireEnv('SUPABASE_SERVICE_KEY');
}

function redactConnectionString(value) {
  return value.replace(/\/\/([^:@/]+)(?::[^@/]*)?@/, '//<user>:<password>@');
}

module.exports = {
  getSupabaseDbUrl,
  getSupabaseUrl,
  getSupabaseServiceKey,
  redactConnectionString,
  requireEnv,
};
