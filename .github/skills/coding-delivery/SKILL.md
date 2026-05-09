---
name: coding-delivery
description: 'Execute new feature or bugfix delivery end-to-end: align to business logic, implement code with correct rules, verify build, run senior-level code review checklist, deliver full backend and frontend tests with 100% coverage target, update project documentation, then commit and push to main.'
argument-hint: 'Feature request, business rules, and acceptance criteria'
user-invocable: true
---

# Coding Delivery

## Purpose
Use this skill when you receive a request to add a new feature or modify code and must deliver production-quality results with strict technical governance.

## Trigger Conditions
- "Add feature"
- "Fix bug"
- "Refactor"
- "Implement business logic"
- "Code, verify, review, test, document, commit"

## Mandatory Workflow
1. Parse request and extract acceptance criteria.
2. Validate business logic with [business-logic-checklist.md](./references/business-logic-checklist.md).
3. Implement minimal, correct code changes.
4. Verify compile/build and static checks.
5. Perform a senior-style review with [senior-review-rubric.md](./references/senior-review-rubric.md).
6. Add backend and frontend tests based on [test-and-coverage-policy.md](./references/test-and-coverage-policy.md).
7. Enforce coverage gate target 100% line, branch, function, and statement for changed scope.
8. Update relevant docs following [documentation-update-checklist.md](./references/documentation-update-checklist.md).
9. Append execution notes to `docs/delivery/coding-execution-log.md` using [execution-log-template.md](./assets/execution-log-template.md).
10. Commit and push using [git-release-protocol.md](./references/git-release-protocol.md).

## Required Outputs
- Working implementation aligned with business logic.
- Build/lint/type-check results.
- Senior review findings and remediations.
- Backend + frontend test evidence.
- Coverage evidence with explicit percentages.
- Documentation updates list.
- Execution log update entry.
- Commit hash and push confirmation.

## Hard Gates
- Do not mark done if build fails.
- Do not mark done if review has unresolved high-severity findings.
- Do not mark done if tests fail.
- Do not mark done if changed-scope coverage is below 100%.
- Do not mark done if required docs are not updated.
- Do not mark done if execution log is not appended.

## Templates
- Implementation plan: [implementation-plan-template.md](./assets/implementation-plan-template.md)
- Review report: [review-report-template.md](./assets/review-report-template.md)
- Test matrix: [test-matrix-template.md](./assets/test-matrix-template.md)
- Change log entry: [change-log-entry-template.md](./assets/change-log-entry-template.md)
- Execution log entry: [execution-log-template.md](./assets/execution-log-template.md)
