# Repo Copilot Instructions

## Error Memory Rule

When handling any bug, regression, runtime exception, build failure, lint error, type error, or broken script:
- Use the `error-memory-loop` skill.
- Capture the exact error signature before editing.
- Do not finish until `docs/bugs/error-memory-log.md` has a new or updated entry for the issue.
- If the lesson is reusable, also store a concise repository memory note.

# Git conventions

- Create branches from `main` using `feat/...`, `fix/...`, `update/...`,
  `refactor/...`, `docs/...`, `test/...`, `ci/...`, `chore/...`, `hotfix/...`,
  or `release/...`.
- Use Conventional Commit subjects such as `feat(ai): add voice scanning`.
- Use the same format for PR titles.
- Never add `codex/`, `AI/`, `[codex]`, `[AI]`, author names, or tool names as
  branch or PR-title prefixes.
- Follow `CONTRIBUTING.md` for CI resilience and validation requirements.
