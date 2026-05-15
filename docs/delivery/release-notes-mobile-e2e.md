# Release Notes — Mobile E2E & Build (staging)

Summary

- Added Playwright web E2E harness and three smoke/integration tests covering: register/login, profile update, and strength session submission.
- CI: Added `mobile-e2e` job to run Expo web + Playwright tests in GitHub Actions.
- Optional: `mobile-eas-build` job (Android preview) added; gated on `EXPO_TOKEN` repo secret.
- Documentation: `docs/delivery/mobile-e2e-build.md` contains run instructions and CI notes.

What changed (key files)

- `apps/mobile/package.json` — E2E scripts and Playwright devDeps
- `apps/mobile/playwright.config.ts` — Playwright config (baseURL -> http://localhost:19006)
- `apps/mobile/e2e/*` — Playwright tests and helpers for auth/profile/strength
- `.github/workflows/ci-cd.yml` — `mobile-e2e` and optional `mobile-eas-build` jobs
- `docs/delivery/mobile-e2e-build.md` — runbook and CI notes

How to run locally

1. Install dependencies (root):

```bash
npm ci
```

2. In one terminal start Expo web:

```bash
cd apps/mobile
npm run dev:web
```

3. In another terminal run Playwright tests:

```bash
cd apps/mobile
npm run e2e:setup
npm run e2e
```

Notes and next steps

- Native EAS builds require secrets and platform credentials (Apple/Google). Add `EXPO_TOKEN` to repository secrets to enable the `mobile-eas-build` job.
- The Playwright tests use network request mocking to avoid depending on a running backend; extend mocks to cover additional API behaviors as needed.
- Consider adding native-device E2E (Detox/Appium) for device-level validation; that requires adding an Android/iOS simulator/emulator stage to CI.
