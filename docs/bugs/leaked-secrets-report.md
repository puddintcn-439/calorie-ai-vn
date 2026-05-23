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

Rotation log — 2026-05-23

- GitHub Actions secrets updated: `GEMINI_API_KEY`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` (values not recorded here).
- CI smoke-tests rerun (run id: 26322625574) completed successfully; AI debug returned `success:true`.
- Action taken: GitHub secrets were set using `gh secret set` and the repository helper scripts (`scripts/rotate_github_secrets.sh` / `scripts/rotate_github_secrets.ps1`).
- Historical note: the old provider-side keys were revoked in provider consoles after new keys were deployed and verified:
   - Supabase: Project → Settings → API — regenerate or create replacement `service_role` key, update secrets, verify staging, then remove old key.
   - Google Cloud (Gemini): Console → APIs & Services → Credentials — create a new API key (or service account key), restrict it to the necessary APIs, update secrets, verify, then delete the old API key.
   - Tavily: Dashboard → API keys — create new key, update secrets, verify, then delete old key.
- Verification: run `node ./scripts/find_potential_secrets.js` and run CI smoke-tests (or `scripts/smoke_backend_test.ps1`) to confirm services operate with new keys.
- Notes: Do NOT commit rotated secrets back into the repo. Record the revocation event (who/when) in the incident log after provider-side deletion.
- Tracking issue: https://github.com/puddintcn-439/calorie-ai-vn/issues/3
- Current blocker: none. Supabase, Gemini, and Tavily provider-side revocation has been completed and documented.
- Completion: 100% for the provider-side secret rotation/revocation work tied to this incident.
