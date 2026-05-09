---
name: production-readiness
description: 'Evaluate production readiness percentage, generate a go-live report, identify required actions, and keep readiness notes updated after each execution. Use for launch reviews, release gates, risk checks, and production hardening.'
argument-hint: 'Scope, target go-live date, and constraints'
user-invocable: true
---

# Production Readiness

## When To Use
- You need a clear production readiness percentage for a system or module.
- You want a prioritized action list before go-live.
- You need consistent tracking notes that are updated on each review.

## Required Inputs
- Scope: app/service/module under review.
- Target go-live date.
- Environment scope: web, mobile, backend, infra, data.
- Constraints: team size, budget, deadlines, compliance.

## Procedure
1. Collect current evidence from code, configs, CI/CD, monitoring, and runbooks.
2. Score each domain with the model in [scoring-model.md](./references/scoring-model.md).
3. Calculate weighted readiness percentage.
4. Generate a snapshot report using [readiness-report-template.md](./assets/readiness-report-template.md).
5. Build prioritized actions using [action-plan-template.md](./assets/action-plan-template.md).
6. Update `docs/production/readiness-report.md` with the newest snapshot.
7. Append one entry to `docs/production/production-progress-log.md` using [progress-log-template.md](./assets/progress-log-template.md).

## Output Contract
- One readiness percentage and gate status.
- Domain-by-domain scores with rationale.
- P0/P1/P2 action list with owner and ETA.
- Updated notes in `docs/production/readiness-report.md` and `docs/production/production-progress-log.md`.

## Gate Rules
- `>= 85%`: Production-ready with minor follow-ups.
- `70-84%`: Conditionally ready, must close P0 before go-live.
- `< 70%`: Not ready, postpone release and execute hardening plan.
