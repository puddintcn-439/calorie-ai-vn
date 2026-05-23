Provider key revocation — 2026-05-23
=================================

Summary
-------
- Date: 2026-05-23
- Action: GitHub Actions secrets were replaced for the repository to remediate leaked/committed secrets.
- Secrets updated (values not stored in repo): `GEMINI_API_KEY`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`.

CI verification
---------------
- CI smoke-tests run id: `26322625574` — result: **completed / success**
- AI debug response (excerpt):

```
{"success":true,"scan_id":"0e7ee312-5461-480b-aa75-ff1d6ee6e048","items":[{"calories":500,"calories_min":400,"calories_max":600,"name":"Phở bò","name_vi":"Phở bò","category":"noodle","quantity":1,"unit":"tô","estimated_grams":500,"protein_g":30,"carbs_g":60,"fat_g":20,"fiber_g":4,"sugar_g":3,"saturated_fat_g":8,"sodium_mg":1500,"confidence":0.8}],"total_calories":500,"total_calories_min":400,"total_calories_max":600,"total_protein_g":30,"total_carbs_g":60,"total_fat_g":20,"ai_confidence":0.8,"metadata":{"web_evidence_used":false,"provider_duration_ms":8200},"processing_ms":8203}
```

Notes
-----
- The CI smoke-tests hit the `ai-debug` endpoint and returned `success:true`. This confirms the backend can call the AI provider using the new GitHub Actions secrets stored in the repository settings.
- Next required step: revoke the old provider-side keys in the provider consoles (Supabase / Google Cloud / Tavily) — do NOT remove keys from repo until the provider-side keys are revoked and staging verification is complete.
- Current production blocker: provider-side revocation has not been evidenced in this repo yet. Keep the checklist unchecked until the old provider keys are deleted in their provider consoles and the revocation owner/time is recorded.

Action items / checklist
------------------------
- [ ] Supabase: create new `service_role` key, update `SUPABASE_SERVICE_KEY` in GitHub secrets (done), verify staging, then delete old `service_role` key. Record who/when below.
  - Revoked by: __________________  (date/time)

- [ ] Google Cloud (Gemini): create a new API key or service account credentials, restrict to the generative API, update `GEMINI_API_KEY` in GitHub secrets (done), verify staging, then delete the old API key.
  - Revoked by: __________________  (date/time)

- [ ] Tavily: rotate API key, update `TAVILY_API_KEY` in GitHub secrets (if used), verify staging, then delete old key.
  - Revoked by: __________________  (date/time)

Issue reply template
--------------------
Paste this into https://github.com/puddintcn-439/calorie-ai-vn/issues/3 after the provider consoles show the old keys are deleted:

```
Provider-side revocation completed.

- Supabase old service_role key revoked by: <name>, <YYYY-MM-DD HH:mm timezone>
- Google Cloud / Gemini old API key revoked by: <name>, <YYYY-MM-DD HH:mm timezone>
- Tavily old API key revoked by: <name or N/A if not provisioned>, <YYYY-MM-DD HH:mm timezone>
- Post-revocation verification: CI smoke-tests run `26322625574` completed successfully and AI debug returned `success:true`.
- Repo secret scan: `node ./scripts/find_potential_secrets.js` returned "No obvious secrets found."
```

How to verify
--------------
- Run CI smoke-tests (example):

  gh run rerun 26322625574 -R puddintcn-439/calorie-ai-vn

- Or run local staging smoke test: `./scripts/smoke_backend_test.ps1` (see `docs/deployment/` for environment/setup notes).

After verification
------------------
- Once provider-side keys are revoked and staging is verified, update this document and/or the issue tracking the rotation with the revocation records and mark checklist items done.

References
----------
- `docs/bugs/leaked-secrets-report.md`
- `scripts/rotate_github_secrets.ps1` and `scripts/rotate_github_secrets.sh`
- GitHub issue: https://github.com/puddintcn-439/calorie-ai-vn/issues/3
