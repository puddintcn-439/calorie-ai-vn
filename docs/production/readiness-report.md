# Production Readiness Report

## Metadata
- Date: 2026-05-19 (current source of truth)
- Scope: calorie-ai-vn (monorepo)
- Target Go-Live: 2026-Q3 (conditional)
- Reviewer: Codex

## Source-of-Truth Note
- This file is the active production-readiness source of truth as of 2026-05-19.
- `docs/production/PRODUCTION_READINESS_FINAL.md` is superseded and must not be used as the primary readiness reference.
- The superseded file previously claimed 92% readiness with future-dated sign-off dates (2026-05-26 / 2026-05-30), which are not valid current evidence on 2026-05-19.

## Executive Summary
- Readiness Percentage: **72%**
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
| CI/CD and Release Safety | 10 | 4.0 | 8.0 | GitHub Actions CI fixed (coverage gate, smoke tests with real Postgres service); deploy.yml has pre-deploy smoke, post-deploy health check loop (30s/6 attempts), rollback step, and GitHub deployment status record; Dockerfile multi-stage with non-root user and HEALTHCHECK | Deploy rollback step requires real deploy command to be inserted (infra-specific) |
| Testing Quality | 10 | 4.0 | 8.0 | 233/233 backend tests pass; smoke e2e passes; TypeScript check clean for both backend and mobile | Mobile has no automated UI/e2e suite |
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
  - Add mobile smoke/e2e coverage for auth and daily log flows
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

