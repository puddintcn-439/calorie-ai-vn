# Verification Standard

Required verification for bug fix:
- Compile/build passes for impacted project(s).
- Lint/type-check passes for impacted scope.
- Automated tests for bug path and regression path pass.
- Manual sanity check for impacted user flow if needed.

Evidence format:
- Command
- Result
- Scope validated

Status rules:
- Fixed: all verification checks passed.
- Partially Fixed: some checks passed, at least one blocker remains.
- Blocked: fix not verifiable or not safely deployable.
