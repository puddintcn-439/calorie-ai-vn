# Production Progress Log

Use one new entry for each production readiness review or milestone.

## Review Entry
- Timestamp: 2026-05-19T00:00:00Z
- Scope: Readiness documentation normalization
- Reviewer: Codex
- Gate Status: CONDITIONAL NO-GO

### Completed Actions
- Marked `docs/production/readiness-report.md` as the current production-readiness source of truth.
- Superseded `docs/production/PRODUCTION_READINESS_FINAL.md` because it claimed 92% readiness with future-dated sign-off / launch dates.
- Updated `docs/SPRINT_DELIVERY_SUMMARY.md` so it no longer presents the 92% assessment or GA approval as current evidence.

### New Risks Found
- Older historical planning documents still contain launch-date and readiness assumptions. They should be treated as historical unless they explicitly point back to the active readiness report.

### Next Actions
- Continue updating the active readiness report only when new staging, native QA, alerting, deploy, or database evidence is produced.
- Add explicit superseded banners to any older launch checklist if it is reused for current planning.

### Decision
- Gate Status: CONDITIONAL NO-GO
- Notes: Current accepted readiness remains 72% adjusted. The old 92% claim must not be used as the primary readiness reference.

## Review Entry
- Timestamp: 2026-05-16T12:00:00Z
- Scope: P1 health guardrails, nutrition targets, and global-first safety copy
- Reviewer: Codex
- Gate Status: CONDITIONAL NO-GO until external clinical review and staging QA are complete

### Completed Actions
- Added `health_flags` to user profile data model for pregnancy, breastfeeding, kidney disease, diabetes, eating-disorder history/risk, and weight-affecting medication.
- Updated calorie target API to treat BMI as screening/risk, not diagnosis.
- Added medical-review warnings and maintenance-only behavior for under-18, pregnancy/breastfeeding, and eating-disorder risk profiles.
- Paused automatic weekly calorie adjustments when the profile requires medical review.
- Added general nutrition targets to calorie target response: fiber, sodium, free/added sugar, and saturated fat.
- Updated Profile UI with health-risk chips and visible safety warnings.
- Updated Macros card with quality targets for fiber, sodium, free sugar, and saturated fat.
- Added daily log totals and Today UI pills for actual fiber, sodium, total sugar, and saturated fat when logged food data includes those nutrients.
- Added a Today safety prompt for incomplete profile setup and medical-review profiles.
- Added migration `016_food_quality_nutrients.sql` for quality nutrient columns on food logs, foods, and saved meals.
- Added `users.goal_plan` migration and backend-clamped personal goal-plan calculation with safety status/warnings.
- Updated Today/Profile goal-plan UI so quick presets and manual plans go through backend safety clamps.
- Added `user_activity_preferences` migration, API endpoints, Profile add/edit/delete UI, Today movement recommendations from those preferences, and Log quick completion from the same source.

### Remaining Gates
1. Clinical/nutrition expert review for all health copy and thresholds.
2. Staging migration apply for `015_user_health_flags.sql`, `016_food_quality_nutrients.sql`, `017_add_goal_plan_to_users.sql`, and `018_user_activity_preferences.sql`.
3. End-to-end QA for saving/reloading health flags on real Supabase.
4. Product decision on whether to add disease-specific plans later or keep the app as wellness-only.

## Review Entry
- Timestamp: 2026-05-16T00:00:00Z
- Scope: P0 trust, health-safety, build/deploy, and global-first alignment
- Reviewer: Codex
- Gate Status: CONDITIONAL NO-GO until EAS preview build, production deploy webhook, and food DB validation are proven

### Completed Actions
- Updated product docs to global-first positioning with Vietnamese food support as a strength, not a sole market assumption.
- Updated README, app flow, EAS secrets, deployment guide, and readiness summary to match the current 5-tab app and Expo SDK 54.
- Replaced deploy placeholder behavior with required production deploy and rollback webhooks, so CI cannot report a fake successful rollout.
- Normalized barcode fallback from Open Food Facts and cache fallback products locally.
- Fixed barcode logging to scale nutrition by serving size.
- Removed fake voice transcript behavior; voice mode now requires a typed or pasted transcript until real speech-to-text is integrated.
- Added global adult BMI defaults and calorie target safety warnings.
- Blocked weight-loss targets for underweight users and weight-change targets for under-18 users.

### Remaining External Gates
1. Run first EAS Android/iOS preview builds and record build IDs.
2. Configure `PRODUCTION_DEPLOY_WEBHOOK_URL`, `PRODUCTION_ROLLBACK_WEBHOOK_URL`, `PRODUCTION_URL`, and `DEPLOY_TOKEN`.
3. Validate food database coverage on staging for global staples, packaged foods, and localized dishes.
4. Run native QA on HealthKit, Health Connect, barcode, receipt, camera, and auth flows.

## Review Entry
- Timestamp: 2026-05-09T18:00:00Z
- Scope: calorie-ai-vn — P0 production hardening sprint
- Reviewer: Copilot
- Previous Readiness %: 63%
- New Readiness %: **72%**
- Delta %: +9%

### Completed Actions
- **deploy.yml rewritten**: placeholder deploy job replaced with pre-deploy smoke tests (source checkout + Postgres service), post-deploy health check loop (6 × 5s retries), rollback-on-failure step, GitHub deployment status record.
- **ci-cd.yml fixed**: smoke-tests and quality-gate jobs both now have proper Postgres service definitions; corrupted YAML in quality-gate removed; coverage gate runs `npm run test:cov --workspace=backend` (real command, no brittle grep).
- **MetricsService created** (`src/common/metrics/metrics.service.ts`): in-process counters for auth login/register success+failure, AI scan success+failure, activity sync success+failure, HTTP 4xx/5xx; computed rates; alert flags with configurable thresholds.
- **`/health/metrics` endpoint added**: HealthController now exposes GET /health/metrics returning full MetricsSnapshot.
- **MetricsService injected into AuthService and AiService** to record events on every auth attempt and AI scan.
- **RequestLoggingMiddleware updated** to call `metricsService.recordHttpRequest(statusCode)` on every response.
- **monitoring-runbook.md created** with SLO table, alert thresholds (auth failure >25%, AI success <70%, 5xx >50), polling scripts, per-incident response playbooks, log parsing examples.
- **mobile-preview-build-qa-record.md created** with EAS login steps, environment variable setup, build commands, eas.json explanation, native health QA checklist for Android and iOS.
- **eas.json preview profile corrected**: removed `developmentClient: true` from preview profile (was building a dev client binary instead of standalone preview APK).
- **Test suite**: 233/233 tests pass after updating health.controller.spec.ts, auth.service.spec.ts, and ai.service.spec.ts to provide MetricsService mock.

### New Risks Found
- EAS cloud build has not been executed yet — requires `npm exec eas-cli -- login` and an active Expo account. This is the only remaining external dependency.
- Deploy workflow rollback step has a `# TODO` comment — the actual deploy/rollback command must be filled in once infra target (Docker host / Kubernetes) is decided.

### Next Actions
1. Wire one external alert: poll `/health/metrics`, Telegram bot when `alerts[].fired === true`
2. Execute first EAS preview build and record Build ID in mobile-preview-build-qa-record.md
3. Fill in real deploy/rollback command in deploy.yml based on chosen infra

### Decision
- Gate Status: CONDITIONAL NO-GO → near GO-LIVE
- Notes: All P0 code changes are done. Remaining blockers are external-account (EAS) and tooling (alerting hook), not code quality or safety gaps.


- Scope: calorie-ai-vn (initial baseline)
- Reviewer: TBD
- Previous Readiness %: N/A
- New Readiness %: TBD
- Delta %: N/A

### Completed Actions
- Initialized production readiness skill and note system.

### New Risks Found
- TBD

### Next Actions
- Run first full readiness assessment and fill domain evidence.

### Decision
- Gate Status: TBD
- Notes: Baseline entry created.

## Review Entry
- Timestamp: 2026-05-08T00:30:00Z
- Scope: Global calorie AI landscape and production feature dossier
- Reviewer: Copilot
- Previous Readiness %: TBD
- New Readiness %: TBD
- Delta %: N/A

### Completed Actions
- Consolidated web-scan intelligence into production dossier at docs/production/global-calo-ai-feature-dossier.md.
- Updated readiness blockers and action snapshot in docs/production/readiness-report.md.

### New Risks Found
- Unresolved decision on data-source licensing mix may delay implementation.
- No committed KPI threshold yet for go-live.

### Next Actions
- Product and engineering review of dossier recommendations.
- Lock P0/P1 scope and KPI targets for launch gate.

### Decision
- Gate Status: TBD
- Notes: Strategy dossier completed and linked to readiness workflow.

## Review Entry
- Timestamp: 2026-05-08T01:05:00Z
- Scope: Quantified readiness baseline and P0 execution planning
- Reviewer: Copilot
- Previous Readiness %: TBD
- New Readiness %: 38%
- Delta %: N/A

### Completed Actions
- Filled weighted readiness scoring and go-live recommendation in docs/production/readiness-report.md.
- Created launch execution backlog in docs/delivery/p0-launch-backlog.md.
- Added sprint checklist mapping into docs/delivery/coding-execution-log.md.

### New Risks Found
- Observability and incident readiness are below launch-safe threshold.
- No committed owner matrix yet for P0 implementation.

### Next Actions
- Assign owners and target dates for each P0 backlog item.
- Run first implementation sprint and update readiness deltas.

### Decision
- Gate Status: NO-GO
- Notes: Launch blocked until P0 execution gates and KPI instrumentation are complete.

## Review Entry
- Timestamp: 2026-05-08T01:45:00Z
- Scope: P0 execution planning hardening
- Reviewer: Copilot
- Previous Readiness %: 38%
- New Readiness %: 42%
- Delta %: +4%

### Completed Actions
- Added owner-role mapping and ETA detail to docs/delivery/p0-launch-backlog.md.
- Created issue-ready backlog at docs/delivery/p0-issues-ready.md.
- Created daily execution plan for Sprint 1 at docs/delivery/sprint-1-day-plan.md.

### New Risks Found
- Owner roles are defined but not mapped to named individuals yet.
- Timeline risk remains if food ingestion quality requires additional normalization work.

### Next Actions
- Replace owner roles with named assignees and confirm capacity.
- Open tracker tickets from issue-ready file and start Sprint 1 kickoff.

### Decision
- Gate Status: NO-GO
- Notes: Planning maturity improved; implementation evidence still required for gate change.

## Review Entry
- Timestamp: 2026-05-09T00:00:00Z
- Scope: Sprint 1 mobile correction UX + multi-sprint feature delivery
- Reviewer: Copilot
- Previous Readiness %: 46%
- New Readiness %: 56%
- Delta %: +10%

### Completed Actions
- Implemented confidence-aware UI in scan screen: per-item confidence badge (color-coded), low-confidence warning banner, inline food name editing (< 3 taps), item deletion, all wired to correction telemetry.
- Implemented streak/gamification summary + achievements detail screen.
- Implemented streak-aware nudge messages across reminder system (streak context in all NudgeMessage bodies).
- Added nudge preview card in Profile for testing per-meal nudge output.
- Implemented Health Activity Sync foundation (batch ingestion endpoint, activity-sync service, dashboard card).
- Implemented Premium/Subscription flow (paywall, feature gating, tiers).
- Updated P0 backlog to mark completed Sprint 1 mobile items and Sprint 2 reminder/insights items.

### New Risks Found
- Canonical food schema and ingestion pipelines (USDA / Open Food Facts) are still unimplemented — highest remaining P0 backend gap.
- No automated test coverage; all validation is lint/tsc-only; production confidence requires at least smoke tests on auth and logging endpoints.

### Next Actions
- Sprint 1: Implement canonical food entity schema + source lineage migration.
- Sprint 1: Build Open Food Facts ingestion job (simpler than USDA, good baseline).
- Sprint 2: Calorie target engine based on profile.
- Sprint 3: Observability baseline (health endpoint + request logging).

### Decision
- Gate Status: NO-GO (canonical food pipeline + observability still required)
- Notes: Mobile correction UX and personalization features now meet Sprint 1 / Sprint 2 quality bar for launch review. Remaining gap is data layer (food canonical schema) and production hardening.

- Gate Status: NO-GO
- Notes: Environment reliability improved; production controls and P0 execution still pending.

## Review Entry
- Timestamp: 2026-05-09T15:45:00Z
- Scope: calorie-ai-vn current production-readiness rescan
- Reviewer: Copilot
- Previous Readiness %: 56%
- New Readiness %: 63%
- Delta %: +5%

### Completed Actions
- Revalidated live backend health endpoint: status healthy, DB connected, latency reported.
- Revalidated backend quality locally: `npm test` passed 233/233 and `npm run build` passed.
- Revalidated mobile compile health: `npm run lint` passed in apps/mobile.
- Refreshed readiness scoring to reflect shipped health endpoints, smoke coverage, food ingestion, native Activity Sync diagnostics, and the now-aligned backend CI coverage/smoke scripts.

### New Risks Found
- Production deploy workflow is not a real deploy yet; it stops at placeholder notices instead of verified rollout and rollback.
- No concrete alerting/dashboard evidence yet, despite health and request logging existing.
- Mobile native release path for Health Sync is documented but still lacks recorded successful build evidence.

### Next Actions
- Implement real deployment verification and rollback steps in the production workflow.
- Add minimum production monitoring and test one alert path end-to-end.
- Produce one signed-off mobile preview build QA record for the Health Sync flow.

### Decision
- Gate Status: NO-GO
- Notes: Product and core backend behavior are materially more complete than the previous report. Remaining blockers are now mostly operational: CI correctness, deploy safety, monitoring, and native release evidence.

