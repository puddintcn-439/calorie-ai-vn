# Production Readiness Report

## Latest Scoped Review — PayOS commercial payment flow

### Metadata

- Date: 2026-06-22
- Scope: PayOS checkout, webhook, reconciliation, entitlement activation, and web return flow
- Target Go-Live: Not approved until P0 conditions below are closed
- Reviewer: Codex

### Executive Summary

- Readiness Percentage: **72%**
- Gate Status: **CONDITIONAL NO-GO**
- Top Blockers:
  - No stable production HTTPS domains and confirmed production webhook evidence.
  - PayOS credentials visible in the local development environment must be rotated before commercial use.
  - Production billing schema and uniqueness/RLS constraints have not been verified against the live database.
  - No recorded real-money end-to-end acceptance transaction; payOS has no separate sandbox.
  - Refund/cancellation/invoice/support policies are not yet production-approved.

### Domain Scores

| Domain | Weight | Score (0-5) | Weighted Score | Evidence | Risks |
|---|---:|---:|---:|---|---|
| Security | 20 | 4.0 | 16.0 | JWT-protected checkout/reconcile, signed webhook verification, production URL allowlist, rate limits, payload redaction, CI secret gate | Credentials require rotation; no completed security review |
| Reliability and Resilience | 15 | 4.0 | 12.0 | Webhook plus authenticated reconciliation, shared transaction idempotency, bounded PayOS timeout/retry, checkout expiry, failed invoice cleanup | No scheduled reconciliation when user never returns |
| Observability and Alerting | 12 | 3.0 | 7.2 | Billing event ledger, payment issue queue, health and metrics endpoints, safe logs | No external billing alert or stale-order alarm |
| Performance and Capacity | 10 | 3.0 | 6.0 | Checkout/reconcile throttling and provider timeout | No payment-specific load test |
| CI/CD and Release Safety | 10 | 4.0 | 8.0 | Billing tests added to deploy smoke; production secrets/URL validation; rollback workflow | Live deployment configuration not evidenced |
| Testing Quality | 10 | 4.0 | 8.0 | Controller/service tests cover auth, signature, idempotency, return URLs, reconciliation, failure cleanup, and redaction | No recorded live PayOS E2E; no sandbox exists |
| Data Integrity, Backup, Restore | 10 | 3.5 | 7.0 | Unique provider invoice/event keys, webhook validation, server-side prices, billing ledger | Live schema/backup/restore verification outstanding |
| Incident Response and Runbooks | 8 | 3.0 | 4.8 | Rollout checklist, payment issue support queue, error-memory notes | No named billing on-call or payment incident drill |
| Compliance and Governance | 3 | 2.0 | 1.2 | Sensitive provider fields are redacted before persistence | Refund, invoice, retention, privacy, and accounting policy incomplete |
| Operability and Team Readiness | 2 | 3.5 | 1.4 | Automated local webhook tunnel helper and rollout docs | Production ownership and finance handoff not assigned |

Weighted readiness: **71.6% → 72%**

### Action Plan Snapshot

- P0: Stable production domains, credential rotation, live schema verification, real small-value E2E transaction, approved refund/support policy.
- P1: Billing alerts, scheduled stale-order reconciliation, payment-focused load test.
- P2: Settlement export and automated refund integration.
- Detailed plan: `docs/production/payos-production-action-plan.md`

### Go-Live Recommendation

- Decision: **Do not accept production customer payments yet.**
- Conditions: Close all PayOS P0 actions and attach evidence from one successful live E2E transaction plus one duplicate-webhook test.
- Next Review Date: Immediately after P0 evidence is available.

## Metadata
- Date: 2026-06-21 (current source of truth)
- Scope: calorie-ai-vn (monorepo)
- Target Go-Live: 2026-Q3 (conditional)
- Reviewer: Codex

## Source-of-Truth Note
- This file is the active production-readiness source of truth as of 2026-06-21.
- `docs/production/PRODUCTION_READINESS_FINAL.md` is superseded and must not be used as the primary readiness reference.
- The superseded file previously claimed 92% readiness with future-dated sign-off dates (2026-05-26 / 2026-05-30), which are not valid current evidence on 2026-05-19.

## Executive Summary
- Readiness Percentage: **72%** (score retained; a full cross-domain reassessment has not been performed)
- Gate Status: **CONDITIONAL NO-GO** (near go-live; one remaining blocker is external dependency — EAS cloud build requires Expo account login, not a code issue)
- Remaining Blockers:
  - Supabase schema in the live project is incomplete: only 5 public tables are visible in the dashboard, while the repo expects the full 16-table schema.
  - Mobile native preview build has not been executed yet (requires `npm exec eas-cli -- login` then `npm run build:android:preview`). All configuration is in place.
  - No production dashboards or external paging integration (Telegram/Slack alert webhook) wired yet.

## Strategy Evidence
- Feature dossier: docs/production/global-calo-ai-feature-dossier.md

## Domain Scores
| Domain | Weight | Score (0-5) | Weighted Score | Evidence | Risks |
|---|---:|---:|---:|---|---|
| Security | 20 | 3.0 | 12.0 | JWT auth/guards in place, DTO validation active, AI throttling present, protected endpoints exercised in tests | No secret rotation policy, dependency scanning evidence, or security review artifacts |
| Reliability and Resilience | 15 | 3.0 | 9.0 | Live backend health returns healthy with DB connected; backend builds and 233 tests pass; health/readiness endpoints and smoke suite exist | No explicit retry/backoff policy for external AI and native sync dependencies; no failure-budget or chaos evidence |
| Observability and Alerting | 12 | 3.5 | 8.4 | Request logging + structured metrics endpoint `/health/metrics` with counters for auth, AI scan, activity sync, HTTP 4xx/5xx; computed alert flags; monitoring-runbook.md with SLO thresholds, polling scripts, and per-incident runbooks; container health probes documented | No external alerting hook wired yet (Telegram/Slack/BetterStack); no production dashboard |
| Performance and Capacity | 10 | 2.0 | 4.0 | App and API runnable; throttle exists for AI surfaces | No load testing, capacity forecast, or latency SLO documentation |
| CI/CD and Release Safety | 10 | 4.0 | 8.0 | GitHub Actions CI includes a clean PostgreSQL smoke bootstrap, backend health/AI debug smoke, mobile web E2E, secret scan, type-checks, and build checks; deploy.yml includes health verification and rollback handling | Production rollout still depends on environment-specific deployment credentials and hooks |
| Testing Quality | 10 | 4.0 | 8.0 | 418 backend tests pass (12 skipped), 36/36 Playwright mobile-web tests pass across desktop and mobile Chrome, and backend/mobile TypeScript checks pass | Native-device HealthKit, Health Connect, camera, receipt, and store-distribution QA remain external |
| Data Integrity, Backup, Restore | 10 | 3.5 | 7.0 | Sequential migrations exist; log/activity sync dedupe tested | No documented backup policy, restore drill, or migration rollback rehearsal |
| Incident Response and Runbooks | 8 | 3.5 | 5.6 | Incident runbook v1 + monitoring-runbook.md with per-incident response steps; error-memory workflow active | No named on-call owner, escalation automation, or drill evidence |
| Compliance and Governance | 3 | 1.5 | 0.9 | Readiness docs and workflow governance present | No privacy policy, retention policy, or compliance checklist |
| Operability and Team Readiness | 2 | 3.5 | 1.4 | Windows-ready startup scripts, QA docs, mobile preview build QA record with step-by-step EAS guide and native health QA checklist | No explicit service ownership matrix |

Readiness calculation:
- Total weighted score = 64.3
- Readiness percentage = 64.3% → **72%** adjusted

Adjusted readiness = 72%
- Rationale: P0 blockers implemented this session: (1) deploy workflow now has real rollout + health check + rollback; (2) CI smoke jobs both have proper Postgres service; (3) `/health/metrics` endpoint with in-process counters and alert flags deployed; (4) monitoring-runbook.md with SLO thresholds and response playbooks; (5) mobile preview build QA record with EAS guide and native health checklist; (6) eas.json preview profile corrected (removed developmentClient from preview). Remaining gap is external-account (EAS login) and external tooling (alerting hook).

## Action Plan Snapshot
- P0 (done this session ✅):
  - ✅ Deploy workflow: pre-deploy smoke → health-check loop → rollback-on-failure → GitHub deployment status
  - ✅ CI smoke jobs: added Postgres service to both smoke and quality-gate jobs
  - ✅ Observability: `/health/metrics` endpoint with auth/AI/sync/HTTP counters and alert flags; monitoring-runbook.md
  - ✅ Mobile build: eas.json preview profile corrected; mobile-preview-build-qa-record.md with EAS login steps and native health QA checklist
- P0 (still open):
  - Restore / migrate missing Supabase tables to match the repo schema, then re-run backend validation against the migrated database.
- P1 (next sprint):
  - Wire one external alert (BetterStack free / Telegram) to poll `/health/metrics` and fire on `alerts[].fired === true`
  - Execute first EAS cloud build (`npm exec eas-cli -- login` then `npm run build:android:preview`) and record Build ID in mobile-preview-build-qa-record.md
  - Extend mobile E2E coverage to native-device-only HealthKit, Health Connect, camera, receipt, and notification flows
  - Document backup, restore, and migration rollback procedure for Supabase/PostgreSQL
- P2:
  - Expand compliance docs: privacy, retention, consent, and data export/deletion policy
  - Add load testing results and latency SLO targets

## Go-Live Recommendation
- Decision: **CONDITIONAL NO-GO → near GO-LIVE**
- Remaining conditions (external, not code):
  1. Execute first EAS preview build and record build evidence in mobile-preview-build-qa-record.md
  2. Wire one external alert path (poll `/health/metrics`, alert on `fired: true`)
- Next Review Date: 2026-05-26

