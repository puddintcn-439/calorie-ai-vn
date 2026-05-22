SECRETS ROTATION PLAN — Quick Runbook
===================================

Purpose: rotate any leaked/committed secrets (examples found: Supabase service key, Gemini API key, Tavily key). Follow below to rotate safely with minimal downtime.

Pre-rotation checklist
- Notify team and schedule a short maintenance window (or use staging rollout).
- Ensure CI smoke tests are green and you can rollback deployment quickly.
- Ensure you have `gh` CLI and necessary cloud console access.

High-level steps
1. Create new key in provider console (Supabase, Google Cloud for Gemini, Tavily).
2. Update the secret in GitHub Actions (or secret manager) before deploying code that uses the new value.
   - Locally: use `scripts/rotate_github_secrets.sh owner/repo` (exports must be set first)
   - Or set via GitHub UI: Settings → Secrets and variables → Actions → New repository secret
3. Deploy to staging and run smoke tests (CI smoke tests or `scripts/smoke_backend_test.ps1`).
4. After verification, update production secret and deploy to production.
5. Revoke old key in provider console and record the rotation in your incident log.

Detailed provider steps (examples)

Supabase (Service Role Key)
- Console: Project → Settings → API → Generate new 'service_role' key.
- Immediately update `SUPABASE_SERVICE_KEY` in GitHub Secrets (or secret manager).
- Deploy to staging; run migration / smoke tests.
- Once validated, update production secret and deploy.
- Revoke old service key only after all services confirm success.

Gemini / Google API Key
- GCP Console → APIs & Services → Credentials → Create API Key (or create new restricted key).
- Restrict the key: HTTP referrers / IPs or restrict to the generative language API.
- Update `GEMINI_API_KEY` in GitHub Secrets via helper script or UI.
- Deploy to staging; run AI smoke tests (note: quota may apply).
- After validation, promote to production and revoke old key.

If commits contained secrets (post-rotation)
- Rotate/revoke provider-side keys immediately.
- Remove secrets from git history using `git filter-repo` or BFG, then force-push (coordinate with team).

Verification
- Run: `node ./scripts/find_potential_secrets.js` to confirm no clear tokens remain.
- Run CI smoke tests or `./scripts/smoke_backend_test.ps1`.

Post-mortem
- Log rotation event in `docs/production/incident-log.md` (who rotated, why, verification steps).

Notes
- Use short-lived keys and restrict them where possible.
- Keep runbook updated with provider-specific steps and contacts.
