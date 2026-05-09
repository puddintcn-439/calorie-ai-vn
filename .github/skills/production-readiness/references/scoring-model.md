# Production Readiness Scoring Model

Use a 0-5 score for each domain:
- 0: Missing
- 1: Ad-hoc
- 2: Partial
- 3: Baseline
- 4: Strong
- 5: Production-grade

## Domains And Weights
- Security: 20
- Reliability and Resilience: 15
- Observability and Alerting: 12
- Performance and Capacity: 10
- CI/CD and Release Safety: 10
- Testing Quality: 10
- Data Integrity, Backup, Restore: 10
- Incident Response and Runbooks: 8
- Compliance and Governance: 3
- Operability and Team Readiness: 2

Total weight = 100.

## Formula
Weighted domain score = `domain_weight * (domain_score / 5)`

Readiness percentage = `sum(weighted domain score)`

## Required Evidence Per Domain
- Security: auth model, secret handling, dependency scanning, vuln remediation.
- Reliability and Resilience: retries, timeouts, circuit breakers, graceful degradation.
- Observability and Alerting: logs, metrics, traces, SLO/alert rules.
- Performance and Capacity: load test results, capacity limits, bottleneck plan.
- CI/CD and Release Safety: branch policy, automated checks, rollback process.
- Testing Quality: unit/integration/e2e coverage and pass reliability.
- Data Integrity, Backup, Restore: migration safety, backup policy, restore drills.
- Incident Response and Runbooks: incident guide, escalation path, on-call ownership.
- Compliance and Governance: policy checks and audit requirements.
- Operability and Team Readiness: ownership clarity, handoff docs, support readiness.
