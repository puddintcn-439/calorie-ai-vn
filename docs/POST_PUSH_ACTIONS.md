Post-push Actions (after secret history cleanup)
===============================================

Summary: branch `fix/ci-lockfile` has been cleaned and merged into `main`. Do not treat provider revocation as complete without provider-side evidence.

Next steps for the team or CI operator:

1) Upload the new secret to GitHub Actions if backend or CI still needs Supabase access
   - UI: Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
   - CLI, if `gh` is installed and you have `.tmp/supabase_access_token.txt`:
     ```powershell
     gh secret set SUPABASE_SERVICE_KEY -R puddintcn-439/calorie-ai-vn --body-file .tmp/supabase_access_token.txt
     Remove-Item .tmp/supabase_access_token.txt
     ```

2) Verify GitHub Secret Scanning and Push Protection
   - UI: Repository -> Security -> Secret scanning alerts
   - If an old token still appears, resolve it from the GitHub security page.

3) Run the CI integration check
   - Workflow: `ci-smoke-tests-integration.yml` on `main` with `AI_SIMULATE_LOCAL_RESPONSE=false`
   - If using `gh`:
     ```powershell
     gh workflow run ci-smoke-tests-integration.yml -R puddintcn-439/calorie-ai-vn --ref main
     ```

4) Sync the team after any force-push
   - Notify collaborators to run:
     ```powershell
     git fetch origin
     git checkout main
     git reset --hard origin/main
     ```

5) Run load/perf tests on staging
   - File: `tests/load/k6/basic.js`
   - Command, if `k6` is available: `k6 run tests/load/k6/basic.js`

6) Keep the mirror backup only until verification is complete
   - Mirror backup path: `..\calorie-ai-vn-backup.git`
   - Delete it once everything is verified: `Remove-Item -Recurse -Force ..\calorie-ai-vn-backup.git`

Security notes:
- Do not paste secrets into chat.
- Revoke the old key in Supabase Console after rotation and staging verification.
- If needed, I can help dispatch workflows once `gh` is available and the new secret is uploaded.
