# Contributing

## Branch naming

Create branches from an up-to-date `main` branch. Use a lowercase change type,
a slash, and a short kebab-case description:

```text
feat/voice-food-logging
fix/mobile-login-timeout
update/expo-dependencies
refactor/ai-usage-service
docs/voice-qa-runbook
test/portion-e2e
ci/npm-install-retry
chore/cleanup-unused-assets
hotfix/production-auth
release/2026-06
```

Do not use author or tool prefixes such as `codex/`, `ai/`, usernames, or
ticket-system names as the branch type.

Allowed branch types:

- `feat`
- `fix`
- `update`
- `refactor`
- `docs`
- `test`
- `ci`
- `chore`
- `hotfix`
- `release`

## Commit messages

Use Conventional Commit-style subjects:

```text
feat: add voice food logging
feat(ai): add Gemini audio transcription
fix(mobile): prevent duplicate recording upload
update(deps): upgrade Expo packages
test(ai): cover provider timeout fallback
ci: retry transient npm registry failures
```

The allowed commit types are the same as the branch types. Keep the subject
concise, imperative, and free of generated-author prefixes.

## Pull request titles

PR titles follow the same format as commit subjects:

```text
feat(ai): complete Gemini voice food logging
fix(auth): handle expired refresh tokens
update(deps): upgrade Firebase packages
```

Do not prefix PR titles with `[codex]`, `[AI]`, an author name, or similar
labels.

## CI and network resilience

Package registry failures such as `ECONNRESET`, aborted response bodies, or
temporary 5xx responses are infrastructure failures, not dependency defects.

When adding dependency-install steps:

- use the repository's locked package manager and `npm ci`;
- configure bounded npm fetch retries;
- use a bounded step-level retry with backoff for registry connectivity;
- never hide a persistent failure after the final retry;
- do not upgrade unrelated dependencies merely because npm prints deprecation
  warnings during a transient network failure.

When a CI job fails, inspect the exact job log before changing application code.
Record reusable failure patterns in [docs/bugs/error-memory-log.md](docs/bugs/error-memory-log.md).

## Before opening a PR

Run the checks relevant to the changed packages. For cross-package changes:

```bash
npm --workspace apps/mobile run lint
npm --workspace apps/backend run build
npm run test
```
