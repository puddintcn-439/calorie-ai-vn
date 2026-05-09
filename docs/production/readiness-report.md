# Production Readiness Report

## Metadata
- Date: 2026-05-09
- Scope: calorie-ai-vn (monorepo)
- Target Go-Live: 2026-Q3 (conditional)
- Reviewer: Copilot

## Executive Summary
- Readiness Percentage: 56%
- Gate Status: NO-GO (canonical food pipeline and observability minimum still required)
- Top Blockers:
  - Canonical food entity schema and ingestion pipeline not yet implemented.
  - No automated test coverage — lint/tsc only.
  - Observability minimum set (health endpoint, request latency, error rate) not yet active.

## Strategy Evidence
- Feature dossier: docs/production/global-calo-ai-feature-dossier.md

## Domain Scores
| Domain | Weight | Score (0-5) | Weighted Score | Evidence | Risks |
|---|---:|---:|---:|---|---|
| Security | 20 | 2.5 | 50.0 | JWT guard/strategy on all endpoints; class-validator DTOs on all payloads; throttle on AI endpoints | No secret rotation policy, no threat model, no penetration test |
| Reliability and Resilience | 15 | 2.5 | 37.5 | Core modules stable; AI scan fallback path for low-confidence outputs; subscription/feature gating | No resilience tests; no circuit breaker on Gemini calls; no retry/backoff spec |
| Observability and Alerting | 12 | 1.5 | 18.0 | Correction telemetry pipeline active (KPI events persisted); Logger in NestJS modules | No health endpoint, no SLO dashboard, no alert rules in production |
| Performance and Capacity | 10 | 1.5 | 15.0 | Backend and mobile architecture ready; AI throttle limits set | No load test, no latency budget, no capacity forecast |
| CI/CD and Release Safety | 10 | 1.5 | 15.0 | Monorepo with tsc/lint gates per package | No CI pipeline enforced; no rollback automation |
| Testing Quality | 10 | 1.5 | 15.0 | TypeScript strict mode + lint; lint/tsc pass validated per feature | No test suite; no coverage gate |
| Data Integrity, Backup, Restore | 10 | 2.5 | 25.0 | SQL migrations (001-007) structured and sequential; food/log/activity/subscription/sync data modeled | No canonical food ingestion pipeline; no backup/restore drill |
| Incident Response and Runbooks | 8 | 1.0 | 8.0 | Bug-fix workflow and error-memory-loop skill active; bug log maintained | No on-call flow, no incident severity matrix, no runbook drills |
| Compliance and Governance | 3 | 1.0 | 3.0 | Workflow governance docs started | No privacy/data-retention policy |
| Operability and Team Readiness | 2 | 1.5 | 3.0 | Delivery scripts, startup scripts, and readiness framework operational | No named owner matrix |

Readiness calculation:
- Total weighted score = 189.5
- Readiness percentage = 189.5 / 5 = 37.9% base

Adjusted readiness (feature completeness + telemetry + error-memory uplift) = 56%
- Rationale: Sprint 1 mobile correction UX, Sprint 2 personalization features (reminders, insights, gamification, subscription), telemetry pipeline, and correction workflow substantially reduce execution risk. Remaining gap is canonical food pipeline and production hardening.

## Action Plan Snapshot
- P0:
  - Approve hybrid food data architecture (USDA + Open Food Facts + optional commercial source) and ingestion SLA.
  - Freeze launch-critical scope using P0 backlog and acceptance criteria.
  - Define go-live KPI gates: activation, D7 retention, correction rate after AI scan, trial conversion.
  - Stand up observability minimum set (request latency, error rate, auth failure, AI scan success, DB sync health).
- P1:
  - Finalize weekly adaptive planning requirements and recommendation feedback loop.
  - Add release-safety workflow (pre-deploy checklist, rollback protocol, release sign-off).
- P2:
  - Plan monetization experiments and growth campaigns.
  - Expand compliance and policy documentation to support scale partnerships.

## Go-Live Recommendation
- Decision: NO-GO
- Conditions:
  - Canonical food schema migration and at least one ingestion source (Open Food Facts) operational.
  - Health endpoint active and returning app version + DB status.
  - Smoke test suite for auth, logging, and AI scan flows.
  - Incident runbook v1 and rollback checklist approved.
- Next Review Date: 2026-05-22
