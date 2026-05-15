# Mobile E2E & EAS Build — Runbook

This document describes how to run the newly added mobile web E2E tests (Playwright) and how the CI triggers an optional EAS Android preview build.

Local quickstart

- Install dependencies (root):
  - `npm ci`

- Start Expo web locally and run Playwright tests:
  - `cd apps/mobile`
  - `npm run e2e:setup` (installs Playwright browsers)
  - `npm run e2e:ci` (starts Expo web at http://localhost:19006 then runs tests)

CI behavior (GitHub Actions)

- New job `mobile-e2e` will:
  - start an Expo web server in the workflow runner
  - wait for `http://localhost:19006` to become available
  - install Playwright browsers and run `npm run e2e`

- Optional job `mobile-eas-build` will run if `EXPO_TOKEN` is present in repository secrets and will invoke the Android preview EAS build (`npm run build:android:preview` in `apps/mobile`).

Notes & troubleshooting

- Native EAS builds require valid secrets (EXPO_TOKEN and platform-specific credentials); set them in repo secrets before enabling `mobile-eas-build`.
- Playwright tests target the web bundle; native-device E2E (Detox/Appium) is out of scope for this change and can be added separately.
- If `npm run e2e:ci` fails locally, run `npm run dev:web` in one terminal and `npm run e2e` in another to inspect the running app and test output.

Test coverage suggestion

- Add more Playwright tests under `apps/mobile/e2e/` to cover flows: register/login, profile update, create strength session, submit exercises, and sync behavior.
