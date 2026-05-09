---
name: bug-fix-workflow
description: 'Investigate and fix bugs with root cause analysis, step-by-step remediation plan, implementation, build verification, status report, and documentation updates. Use for production defects, QA issues, regressions, and runtime errors.'
argument-hint: 'Bug description, error logs, expected behavior'
user-invocable: true
---

# Bug Fix Workflow

## When To Use
- A bug is reported by user, QA, monitoring, or logs.
- A regression appears after a release.
- A runtime error blocks user flows.

## Inputs
- Bug summary and expected behavior.
- Reproduction signals: logs, stack trace, screenshots, steps.
- Scope and environment: backend, frontend, mobile, web.

## Mandatory Procedure
1. Reproduce or triangulate the bug.
2. Build root cause hypothesis with [root-cause-method.md](./references/root-cause-method.md).
3. Write concrete fix plan using [bug-fix-plan-template.md](./assets/bug-fix-plan-template.md).
4. Implement minimal safe fix.
5. Run build/type/lint and required tests.
6. Create post-fix report with [bug-fix-report-template.md](./assets/bug-fix-report-template.md).
7. Update related docs using [documentation-update-rules.md](./references/documentation-update-rules.md).
8. Append bug history entry to `docs/bugs/bug-fix-log.md` using [bug-log-entry-template.md](./assets/bug-log-entry-template.md).

## Output Requirements
- Root cause statement (specific and testable).
- Files changed and rationale.
- Verification evidence (commands and results).
- Final status: Fixed, Partially Fixed, or Blocked.
- Follow-up actions and risks.

## Hard Gates
- No root cause: cannot mark fixed.
- Build/test failure: cannot mark fixed.
- Missing report/log update: cannot mark done.
