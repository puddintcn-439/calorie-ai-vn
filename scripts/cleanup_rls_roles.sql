-- Cleanup temporary RLS roles created during tests
-- WARNING: destructive. Run only as `supabase_admin` (Project Owner) in SQL Editor.
-- Steps: Project Settings -> Database -> copy Admin connection string -> SQL Editor -> Connect (Direct/URI) -> paste & Run.

DO $$
DECLARE r text;
BEGIN
  FOR r IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname LIKE 'rls_tester_%'
       OR rolname LIKE 'rls_sim_%'
  LOOP
    RAISE NOTICE 'Processing %', r;
    -- Reassign owned objects to supabase_admin, then drop owned objects and role
    EXECUTE format('REASSIGN OWNED BY %I TO supabase_admin', r);
    EXECUTE format('DROP OWNED BY %I CASCADE', r);
    EXECUTE format('DROP ROLE IF EXISTS %I', r);
  END LOOP;
END $$;

-- Verify remaining temp roles (should return none):
-- SELECT rolname FROM pg_roles WHERE rolname LIKE 'rls_tester_%' OR rolname LIKE 'rls_sim_%';
