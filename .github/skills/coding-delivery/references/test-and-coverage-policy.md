# Test And Coverage Policy

## Test Requirements
- Backend: unit + integration tests for changed services/controllers/modules.
- Frontend: component + state/store + flow tests for changed views.
- Add regression tests for the reported issue.

## Coverage Requirement
- Target for changed scope: 100% for line, branch, function, statement.
- If 100% cannot be reached due to technical blockers, mark release as blocked until resolved.

## Minimum Test Matrix
- Happy path
- Validation failure path
- Authorization failure path if relevant
- Boundary values
- Error handling and retries/fallbacks
- Regression case for previous bug

## Evidence
Capture:
- Command executed
- Pass/fail status
- Coverage table per changed package/module
