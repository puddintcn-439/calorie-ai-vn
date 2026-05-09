# Error Memory Log

Use this file to store compact lessons from real failures after they are fixed.

## Entry Rules
- One entry per distinct issue or recurring pattern.
- Record the exact error signature.
- Keep root cause and prevention rule concrete.
- Prefer appending over rewriting history.

## 2026-05-09 - Missing required UiChip selected prop in new preview action row

- Scope: mobile
- Error Signature: `TS2741: Property 'selected' is missing in type '{ key: "breakfast" | "lunch" | "dinner" | "snack"; label: ...; onPress: () => any; }' but required in type 'UiChipProps'.`
- Trigger: `cd apps/mobile ; npm run lint`
- Root Cause: The new reminder preview chips reused `UiChip` as a plain action button even though the component contract requires an explicit `selected` state.
- Fix: Added local `previewMeal` state in the profile screen and passed `selected={previewMeal === mealType}` to every preview chip.
- Validation: `cd packages/types ; npm run build`, `cd apps/backend ; npm run build`, `cd apps/mobile ; npm run lint`
- Prevention Rule: When reusing shared UI primitives for a new interaction, satisfy all required props from the component contract instead of assuming button-like defaults.
- Files: `apps/mobile/app/(tabs)/profile.tsx`
- Reuse Signal: Recheck this whenever adding a new `UiChip` row or converting a selection control into an action launcher.

## 2026-05-09 - Supabase chained query mock mismatch in recommendation tests

- Scope: backend
- Error Signature: `TypeError: this.supabaseService.db.from(...).select(...).gte is not a function` and failing assertions `Expected: 800 Received: 2000` in recommendation tests.
- Trigger: `cd apps/backend ; npx jest src/modules/calorie-target --forceExit`
- Root Cause: Test doubles for Supabase returned a generic chain object that did not match the exact async chain shape used by production code (`logs: select -> eq -> gte`, `foods: select -> gte -> lte -> order -> limit`).
- Fix: Reworked mocks to return query objects by call sequence so each table/query path exposes the exact chained methods and resolves at the right step.
- Validation: `cd apps/backend ; npx jest src/modules/calorie-target --forceExit` => 3 passed suites, 30 passed tests.

## 2026-05-09 - RequestLoggingMiddleware crashes backend on every request

- Scope: backend
- Error Signature: `TypeError: this.get is not a function at RequestLoggingMiddleware.send (response.js:148:17)`
- Trigger: Any HTTP request to the backend (first seen on GET /api/docs at startup)
- Root Cause: `res.send = function(...) { this.logStream... }.bind(this)` — `.bind(this)` forced `this` inside the override to be the middleware instance. Express internally calls `this.get('Content-Type')` inside `res.send`, which only works when `this` is the Response object.
- Fix: Captured `this.logStream` in a closure variable (`const logStream = this.logStream`) before the override, removed `.bind(this)`, and wrapped the log write in try/catch. `this` inside `res.send` now correctly refers to the Response object.
- Validation: `GET /health` returns `{"status":"healthy"}` and backend stays up through all requests.
- Prevention Rule: Never use `.bind(middlewareInstance)` on Express `req`/`res` method overrides. Always capture needed state in closure variables and leave `this` free to refer to the req/res object.
- Files: `apps/backend/src/common/middleware/request-logging.middleware.ts`
- Reuse Signal: Apply this pattern any time you override `res.send`, `res.json`, or `res.end` in Express middleware.
- Prevention Rule: For fluent DB clients, mock the real chain contract per query path and per awaited step instead of using one shared generic chain for all tables.
- Files: `apps/backend/src/modules/calorie-target/__tests__/recommendation.service.spec.ts`
- Reuse Signal: Apply this pattern whenever a service mixes multiple Supabase table queries inside one method.

## 2026-05-09 - Supertest default import failed in Jest e2e suite

- Scope: backend
- Error Signature: `TypeError: (0 , supertest_1.default) is not a function` when running calorie-target e2e tests.
- Trigger: `cd apps/backend ; npx jest src/modules/calorie-target/__tests__/calorie-target.e2e.spec.ts --forceExit`
- Root Cause: E2E spec used default import style (`import request from 'supertest'`) that is incompatible with the current ts-jest/commonjs interop in this repo.
- Fix: Switched to namespace import style (`import * as request from 'supertest'`).
- Validation: `cd apps/backend ; npx jest src/modules/calorie-target/__tests__/calorie-target.e2e.spec.ts --forceExit` => 1 passed suite, 6 passed tests.
- Prevention Rule: In backend Jest suites, prefer namespace import for commonjs-first libraries unless `esModuleInterop` behavior is explicitly verified for that package.
- Files: `apps/backend/src/modules/calorie-target/__tests__/calorie-target.e2e.spec.ts`
- Reuse Signal: Recheck import style first whenever a newly added e2e/integration test throws `...default is not a function` for third-party packages.

## 2026-05-09 - Dev ready scripts appeared hung and intermittently failed with port conflicts

- Scope: scripts
- Error Signature: `Error: listen EADDRINUSE: address already in use :::3000` while starting backend, plus repeated long-running `npm run dev:backend:ready` / `npm run dev:mobile:web:ready` sessions that looked stuck.
- Trigger: `npm run dev:backend:ready`, `npm run dev:mobile:web:ready`
- Root Cause: Ready commands were mapped to foreground dev servers (expected to run forever) and port cleanup logic treated non-blocking socket states (`TIME_WAIT`/`FIN_WAIT`) as hard conflicts while suppressing actionable failures.
- Fix: Updated startup scripts to (1) hard-fail if port cleanup cannot free target LISTEN sockets, (2) launch backend/mobile processes in background, (3) poll health endpoints with bounded retries, (4) use separate stdout/stderr files for `Start-Process`, and (5) surface real script errors instead of silent continue.
- Validation: `npm run dev:ports:clean` => all target ports free, `npm run dev:backend:ready` => `Backend ready on http://localhost:3000`, `npm run dev:mobile:web:ready` => `Mobile web ready on http://localhost:19006`, `./scripts/health-check.ps1` => `Health: PASS`.
- Prevention Rule: Any `*:ready` script must be non-blocking with explicit readiness timeout; in PowerShell, clean only LISTEN sockets, avoid swallowing stop-process errors, and do not redirect stdout/stderr to the same file when using `Start-Process`.
- Files: `scripts/kill-dev-ports.ps1`, `scripts/start-backend-dev.ps1`, `scripts/start-mobile-web.ps1`
- Reuse Signal: Recheck this pattern whenever dev startup is reported as "treo" or when logs contain `EADDRINUSE` on known app ports.

## 2026-05-09 - Authenticated APIs returned 500 because controllers read wrong JWT user field

- Scope: backend
- Error Signature: `Could not find the table 'public.user_subscriptions' in the schema cache` and `Could not find the table 'public.reminder_preferences' in the schema cache` surfaced as 500 for `GET /subscriptions/current`, `GET /subscriptions/features`, `GET /reminders/preferences`; controllers also used `req.user.sub` while `JwtStrategy` returns `{ id, email, full_name }`.
- Trigger: Opening mobile web home after login, then calling protected APIs (`/subscriptions/*`, `/insights/weekly`, `/reminders/*`).
- Root Cause: Two issues overlapped: (1) authenticated controllers expected `req.user.sub` although validated JWT user object uses `id`, causing undefined user ids; (2) environment missing subscription/reminder migrations caused uncaught Supabase table-missing errors that bubbled to 500.
- Fix: Standardized controllers to use `req.user.id ?? req.user.sub` and added graceful fallback in subscription/reminder services when tables are missing in local dev (return free/default state instead of throwing).
- Validation: `cd apps/backend ; npm run build` passed, then authenticated smoke tests returned `200` for `/subscriptions/current`, `/subscriptions/features`, `/insights/weekly`, `/reminders/preferences`.
- Prevention Rule: In Nest auth flows, keep JWT payload field mapping consistent end-to-end (`id` vs `sub`) and add defensive handling for optional/dev-only tables so bootstrap endpoints degrade gracefully instead of returning 500.
- Files: `apps/backend/src/modules/subscription/subscription.controller.ts`, `apps/backend/src/modules/insights/insights.controller.ts`, `apps/backend/src/modules/reminder/reminder.controller.ts`, `apps/backend/src/modules/telemetry/telemetry.controller.ts`, `apps/backend/src/modules/subscription/subscription.service.ts`, `apps/backend/src/modules/reminder/reminder.service.ts`
- Reuse Signal: Recheck this whenever multiple authenticated endpoints fail together right after login or when Supabase reports `schema cache` missing-table errors.
