Leaked Secrets Report
======================

Summary of removed files containing secrets (values have NOT been committed here):

- `apps/backend/.env` — contained `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `JWT_SECRET`, and `AI_SIMULATE_LOCAL_RESPONSE=true` (dev fixture). File removed and replaced with `apps/backend/.env.example`.
- `.env` (repo root) — contained `GEMINI_API_KEY`, `JWT_SECRET`, and `AI_SIMULATE_LOCAL_RESPONSE=true`. File removed.
- `apps/mobile/.env` — contained `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. File removed and replaced with `apps/mobile/.env.example`.

Recommended immediate actions (rotate now):

1. Rotate credentials in upstream providers (do not reuse the same values):
   - Supabase: rotate `service_role` key and any DB passwords referenced by `SUPABASE_DB_URL`.
   - Google Cloud / Gemini: create new API key (restricted to required APIs) and revoke the old one.
   - Tavily (if used): rotate API key.
   - Any other keys noted in removed files.

2. Update secrets in Secret Manager or GitHub Actions Secrets using the provided helper scripts:
   - `scripts/rotate_github_secrets.sh` (Bash) or `scripts/rotate_github_secrets.ps1` (PowerShell).
   - Alternatively update via cloud provider UI.

3. Deploy to staging and run smoke-tests (CI or `scripts/smoke_backend_test.ps1`).

4. After validation, update production secrets and promote.

5. If the leak included long-lived credentials that were used elsewhere, coordinate broader rotation and incident notification.

Notes
- Do NOT commit rotated secrets back into the repository. Keep placeholders in `.env.example` only.
- Use the `scripts/find_potential_secrets.js` scanner to validate the repo after rotations.
