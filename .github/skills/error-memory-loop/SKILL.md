---
name: error-memory-loop
description: 'Handle bug fixes, build failures, lint/type errors, runtime exceptions, and regressions with mandatory error-memory capture so the same class of issue is less likely to repeat. Use when debugging, fixing failures, or closing incidents.'
argument-hint: 'Error message, stack trace, failing command, affected module, expected behavior'
user-invocable: true
---

# Error Memory Loop

## When To Use
- A build, lint, typecheck, runtime, API, or UI error appears.
- A regression is fixed and you want to preserve the lesson.
- You need a repeatable close-out process that records why the issue happened and how to avoid it next time.

## Required Inputs
- Error signature: exact message, failing command, stack trace, or screenshot summary.
- Scope: backend, mobile, web, shared types, infra, or scripts.
- Expected behavior.

## Mandatory Procedure
1. Capture the exact error signature before changing code.
2. Search for similar history in `docs/bugs/error-memory-log.md` and repository memory notes.
3. Build one falsifiable root-cause hypothesis.
4. Implement the smallest fix that addresses the root cause.
5. Run focused validation for the touched slice.
6. Record the lesson in `docs/bugs/error-memory-log.md` using [error-memory-entry-template.md](./assets/error-memory-entry-template.md).
7. Add or update one prevention note in repository memory if the lesson is likely reusable across future tasks.
8. Do not mark the task complete until the memory/log update exists.

## Output Contract
- Exact error signature.
- Root cause in one concrete sentence.
- Fix summary.
- Validation evidence.
- Prevention rule for future work.
- Updated `docs/bugs/error-memory-log.md` entry.

## Hard Gates
- No exact error signature: cannot close.
- No validation step: cannot close.
- No memory/log entry: cannot close.
- If the issue is likely to recur and no prevention rule was written, cannot close.
