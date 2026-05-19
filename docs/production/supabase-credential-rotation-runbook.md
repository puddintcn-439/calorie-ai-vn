# Supabase Credential Rotation Runbook

## When To Use

Use this immediately after any Supabase connection string, database password, anon key, or service role key is committed, pasted into logs, or shared outside the secret store.

## Required Rotation

1. Rotate the Supabase database password in the Supabase dashboard.
2. Regenerate the service role key if it was exposed.
3. Regenerate the anon key if it was exposed.
4. Update the deployment secret store:
   - `SUPABASE_DB_URL`
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
5. Restart backend and worker processes so new env vars are loaded.
6. Re-run RLS/migration checks using env vars only.

## Local Script Usage

Scripts must not contain project credentials. Run them with environment variables:

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres:[rotated-password]@[host]:5432/postgres"
node scripts/test_rls_behavior.js
```

`DATABASE_URL` is accepted as a fallback for scripts that need a PostgreSQL connection.

## Verification

Run:

```powershell
rg -n "postgresql://postgres\.|service_role.*eyJ|supabase\.co|pooler\.supabase\.com" scripts apps supabase docs .env.example
```

The only allowed matches should be placeholders, redacted examples, or historical notes that do not include live credentials.
