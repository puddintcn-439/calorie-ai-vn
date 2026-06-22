# Error Memory Log

Use this file to store compact lessons from real failures after they are fixed.

## Entry Rules
- One entry per distinct issue or recurring pattern.
- Record the exact error signature.
- Keep root cause and prevention rule concrete.
- Prefer appending over rewriting history.

## 2026-06-10 - New AI usage endpoint controller existed but was not registered in AiModule

## 2026-06-11 - Shared AI types file lost its header and masked backend credit-budget validation

- Scope: shared types + backend build/test
- Error Signature: `TS2305: Module '"@calorie-ai/types"' has no exported member 'AiUsageFeature'`, then `TS2305: Module '"./ai.types"' has no exported member 'AIDetectedItem'` while running `npm --workspace apps/backend test -- ai-usage.service.spec.ts --runInBand`.
- Trigger: Implementing AI Credit Budget V2 in `AiUsageService` and validating backend tests after migration `033_ai_usage_credit_budget.sql` had already been applied.
- Root Cause: `packages/types/src/ai.types.ts` in the workspace had been truncated from the top, so core AI request/response interfaces and the start of the `AiUsageFeature` union were missing even though downstream packages still imported them.
- Fix: Restored the missing AI request/response type definitions and complete `AiUsageFeature` union in `packages/types/src/ai.types.ts`, then reran targeted and full repo validation.
- Validation: `npm --workspace apps/backend test -- ai-usage.service.spec.ts --runInBand`, `npm run build`, `npm run test`.
- Prevention Rule: When a backend/service change suddenly fails on missing exports from a long-lived shared types package, inspect the source file header for accidental truncation before refactoring consumers.
- Files: `packages/types/src/ai.types.ts`, `apps/backend/src/modules/ai/ai-usage.service.ts`, `apps/backend/src/modules/ai/__tests__/ai-usage.service.spec.ts`
- Reuse Signal: Recheck this first whenever multiple unrelated imports from the same shared type file disappear together after an otherwise local feature change.

## 2026-06-10 - New AI usage endpoint controller existed but was not registered in AiModule

- Scope: backend
- Error Signature: Runtime API path for `GET /ai/usage/summary` is missing and can surface as `Controller not found` / route not mapped for expected endpoint.
- Trigger: After adding `ai-usage.controller.ts` for admin usage summary without wiring it into the AI module controller list.
- Root Cause: New controller file was created but `AiModule` `controllers` array did not include `AiUsageController`.
- Fix: Imported `AiUsageController` and registered it in `apps/backend/src/modules/ai/ai.module.ts`.
- Validation: `cd apps/backend ; npm test -- src/modules/ai/__tests__/ai-usage.service.spec.ts`, `cd apps/backend ; npm run build`.
- Prevention Rule: Every new Nest controller must be added to the owning module's `controllers` list in the same change set, then verified via build/start route mapping.
- Files: `apps/backend/src/modules/ai/ai.module.ts`, `apps/backend/src/modules/ai/ai-usage.controller.ts`
- Reuse Signal: Recheck module wiring first whenever a newly added endpoint file compiles but route is not reachable.

## 2026-06-10 - New analytics filter style used non-existent theme radius token

- Scope: mobile
- Error Signature: `TS2339: Property 'md' does not exist on type '{ sm: number; lg: number; xl: number; }'` at `app/(tabs)/beta-analytics.tsx`.
- Trigger: `cd apps/mobile ; npm run lint`
- Root Cause: Newly added filter button style referenced `radii.md` even though the mobile theme only exposes `sm`, `lg`, `xl`.
- Fix: Replaced `radii.md` with `radii.sm` in the usage window filter button style.
- Validation: `cd apps/mobile ; npm run lint`
- Prevention Rule: Before adding new style tokens in mobile screens, validate available keys in the shared theme contract used by `createThemedStyles`.
- Files: `apps/mobile/app/(tabs)/beta-analytics.tsx`
- Reuse Signal: Recheck this first whenever TypeScript flags missing `radii` keys after UI style changes.

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

## 2026-05-09 - Duplicate coach screen block caused TypeScript parse failure

- Scope: mobile
- Error Signature: `TS1128: Declaration or statement expected` at `app/(tabs)/coach.tsx:432` and `app/(tabs)/coach.tsx:478`
- Trigger: `cd apps/mobile ; npm run lint`
- Root Cause: A duplicated tail block (second partial component + second style object) was appended after the valid `StyleSheet.create(...)` close, leaving orphan statements at file scope.
- Fix: Removed the duplicated trailing block and kept only one valid `CoachScreen` component and one `styles` object.
- Validation: `cd apps/mobile ; npm run lint`
- Prevention Rule: After large merges or manual conflict cleanup in long RN screen files, quickly scan for repeated `return (...)` and repeated `const styles = StyleSheet.create(...)` blocks before running typecheck.
- Files: `apps/mobile/app/(tabs)/coach.tsx`
- Reuse Signal: Recheck this pattern first whenever TypeScript reports `TS1128` in a UI screen near the end of file.

## 2026-05-09 - Native mobile build tooling failed because EAS CLI was invoked through unstable shell paths

- Scope: mobile tooling
- Error Signature: `eas : The term 'eas' is not recognized as the name of a cmdlet`, `npx : The term 'npx' is not recognized as the name of a cmdlet`, and `npm error could not determine executable to run` while attempting Android preview builds.
- Trigger: Trying to run native preview builds for Activity Sync from Windows PowerShell.
- Root Cause: The shell PATH was inconsistent for global CLIs and the repo relied on ad-hoc `eas` / `npx eas` invocation instead of a workspace-safe execution path.
- Fix: Added explicit mobile scripts that use `npm exec eas-cli -- ...`, added `apps/mobile/eas.json` preview profiles, and verified the CLI resolves successfully with `npm exec eas-cli -- --version`.
- Validation: `cd apps/mobile ; npm run lint`, `cd apps/mobile ; npm exec eas-cli -- --version` => `eas-cli/18.11.0`.
- Prevention Rule: In this repo on Windows, prefer `npm exec <cli>` inside the target workspace over bare global CLIs or `npx` when build tooling must be reproducible across shells.
- Files: `apps/mobile/package.json`, `apps/mobile/eas.json`
- Reuse Signal: Recheck this first whenever Expo/EAS commands fail in VS Code PowerShell with PATH-related executable errors.

## 2026-05-09 - Expo typed routes blocked compile right after adding a new stack screen

- Scope: mobile
- Error Signature: `TS2345: Argument of type '"/health-sync"' is not assignable to parameter of type ...` at `app/(tabs)/index.tsx:275` during `cd apps/mobile ; npm run lint`
- Trigger: Navigating to a newly added top-level Expo Router screen immediately after creating the route file.
- Root Cause: Expo typed route generation had not yet reflected the new route in the inferred `router.push()` union when the dashboard call site was typechecked.
- Fix: Kept the new screen route and used a narrow `as never` cast at the call site so the route can compile without widening unrelated types.
- Validation: `cd apps/mobile ; npm run lint`
- Prevention Rule: After adding a new Expo Router screen under typed routes, expect a brief mismatch window; either regenerate routes if available or isolate the temporary cast to the navigation call site.
- Files: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/health-sync.tsx`
- Reuse Signal: Recheck this whenever a newly added route exists on disk but `router.push()` rejects its path literal.

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

## 2026-05-09 - Backend build failed because npm was not available in shell PATH

- Scope: tooling
- Error Signature: `CommandNotFoundException: npm : The term 'npm' is not recognized as the name of a cmdlet, function, script file, or operable program.`
- Trigger: `cd apps/backend ; npm run build`
- Root Cause: The active VS Code terminal session did not inherit machine/user PATH entries, so Node/npm binaries were not resolvable.
- Fix: Rebuilt PATH inside the command before running build: `$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')`.
- Validation: `cd apps/backend ; npm run build` completed successfully after PATH reload.
- Prevention Rule: For Windows PowerShell sessions in this repo, prefix critical npm commands with explicit machine+user PATH reload when terminal state is uncertain.
- Files: `docs/bugs/error-memory-log.md`
- Reuse Signal: Recheck this when `npm`/`node` suddenly become unavailable despite being installed.

## 2026-05-09 - Mobile lint failed after voice/context wiring due to syntax, dependency, and stale shared build gaps

- Scope: mobile
- Error Signature: `TS1005: ',' expected` at `app/(tabs)/index.tsx:316`, then `TS2307: Cannot find module 'expo-av'` and `TS2305: Module '@calorie-ai/types' has no exported member 'ContextMode'/'CONTEXT_ADAPTERS'` during `cd apps/mobile ; npm run lint`
- Trigger: `cd apps/mobile ; npm run lint`
- Root Cause: The mobile slice combined three integration gaps: a missing comma in the dashboard `StyleSheet`, a new Expo native module used in code without installing the package, and new shared context types added in source without rebuilding the `@calorie-ai/types` dist consumed by the mobile app.
- Fix: Added the missing comma in the dashboard style object, installed `expo-av` in the mobile workspace, rebuilt `packages/types`, and updated Expo app config with microphone + notification native permissions/plugins required by the new voice/push flows.
- Validation: `cd packages/types ; npm run build`, `cd apps/mobile ; npm run lint`, `cd apps/mobile ; npx expo config --json`
- Prevention Rule: After adding a new Expo module or new shared types, complete the full integration loop before calling the feature done: install the package, rebuild any dist-based shared workspace package, and verify required native permissions/plugins in Expo config.
- Files: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/package.json`, `apps/mobile/app.json`, `packages/types/dist/*`
- Reuse Signal: Recheck this whenever mobile code imports a new Expo package or newly added exports from `@calorie-ai/types` are not seen by another workspace.

## 2026-05-09 - Native health readiness UI overstated device readiness when permissions were still missing

- Scope: mobile
- Error Signature: No compile error; Activity Sync diagnostics showed the phone as ready and exposed a generic deep link even when Health permissions were still missing.
- Trigger: Production-hardening pass on the native Activity Sync flow.
- Root Cause: `getPhoneCheckInfo()` inferred readiness from provider availability alone and returned the app root deep link instead of the dedicated diagnostics route.
- Fix: Derived phone readiness from `getDiagnostics()` permission state, introduced an explicit `needs-permission` status, and unified the phone QA link to `calorieai://health-sync`.
- Validation: `cd apps/mobile ; npm run lint`, `cd apps/backend ; npm test -- log.controller.spec.ts`
- Prevention Rule: For native diagnostics surfaces, never map provider availability directly to ready state; gate readiness on the real permission snapshot and keep any support/deep link aligned with the actual diagnostics route.
- Files: `apps/mobile/services/activity-sync.service.ts`, `apps/mobile/app/health-sync.tsx`, `apps/mobile/app/(tabs)/index.tsx`
- Reuse Signal: Recheck this whenever a mobile integration exposes a readiness badge plus a QA/deep-link entry point.

## 2026-05-09 - CI/CD quality-gate YAML corrupt and smoke-tests job missing Postgres service

- Scope: CI/CD
- Error Signature: `yaml: invalid syntax` (corrupt indentation in quality-gate job after failed patch); smoke-tests job failing with `Connection refused` on DB_URL because no `services.postgres` block was present.
- Trigger: Review of `.github/workflows/ci-cd.yml` during production hardening.
- Root Cause: A previous patch applied to the wrong YAML context, leaving shell command text (`run:` + `env:`) inside a `run: |` block as literal YAML keys, corrupting the document. The smoke-tests job was originally a container-based step and still referenced `localhost:5432` without spawning a postgres service container.
- Fix: Rewrote both `smoke-tests` and `quality-gate` jobs with correct YAML structure; added `services.postgres` to both; replaced brittle grep-based coverage gate with `npm run test:cov --workspace=backend`.
- Validation: `npx tsc --noEmit` (backend, zero errors), `npm run test --workspace=backend` (233/233 pass).
- Prevention Rule: When patching YAML workflow files with multi-line `run:` blocks, always read the full surrounding context first and verify indentation matches YAML spec. Never use grep on percentages as a CI coverage gate — let the test runner enforce thresholds.
- Files: `.github/workflows/ci-cd.yml`
- Reuse Signal: Recheck this whenever editing multi-line `run:` steps in GitHub Actions YAML.

## 2026-05-09 - NestJS service constructor extended with new dependency breaks existing spec instantiations

- Scope: backend
- Error Signature: `TS2554: Expected 3 arguments, but got 2` in `auth.service.spec.ts`; `TS2554: Expected 2 arguments, but got 1` in `ai.service.spec.ts`; `NestJS dependency injection error` in `health.controller.spec.ts` when `MetricsService` was added to `HealthController`.
- Trigger: Adding `MetricsService` dependency to `AuthService`, `AiService`, and `HealthController`.
- Root Cause: Specs construct services with `new Service(dep1, dep2)` rather than via the NestJS DI container, so adding a new constructor parameter breaks all existing call sites. TestingModule-based specs miss the new provider if it is not added to the `providers` array.
- Fix: Added `makeMetrics()` helper returning a partial mock in each affected spec; passed it as the additional constructor argument. Added `MetricsService` to the `providers` array in the NestJS `TestingModule` spec.
- Validation: `npm run test --workspace=backend` → 233/233 pass.
- Prevention Rule: After adding any new constructor dependency to a NestJS service/controller, immediately scan `__tests__/` for direct `new Service(...)` instantiations and add the mock dependency. For NestJS TestingModule specs, check that the new provider is listed.
- Files: `src/modules/auth/__tests__/auth.service.spec.ts`, `src/modules/ai/__tests__/ai.service.spec.ts`, `src/health/__tests__/health.controller.spec.ts`
- Reuse Signal: Recheck this any time a shared injectable (e.g., MetricsService, EventEmitter) is added to an existing NestJS service constructor.

## 2026-05-09 - Supabase db push failed on partially migrated project with duplicate policies, indexes, and migration versions

- Scope: supabase migrations
- Error Signature: `ERROR: policy "Users can view own profile" for table "users" already exists (SQLSTATE 42710)`, `ERROR: relation "foods_name_search_idx" already exists (SQLSTATE 42P07)`, `ERROR: prepared statement "lrupsc_1_0" already exists (SQLSTATE 42P05)`, and `ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505) Key (version)=(004) already exists.`
- Trigger: `npm exec supabase -- db push --db-url 'postgresql://...@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' --include-all --yes`
- Root Cause: The remote Supabase project already had part of the schema applied manually, while local migration files reused version numbers (`004`, `005`, `006`) and recreated policies/indexes without replay-safe guards.
- Fix: Added `drop policy if exists` before policy creation, changed all remaining indexes to `if not exists`, renamed duplicate version files to `0041_saved_meals.sql`, `0051_reminders.sql`, and `0061_subscriptions.sql`, repaired remote history for version `004`, and reran `supabase db push` with `statement_cache_mode=describe`.
- Validation: `npm exec supabase -- migration list --db-url 'postgresql://...@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require&statement_cache_mode=describe'` showed local and remote aligned for `001`, `002`, `003`, `004`, `0041`, `005`, `0051`, `006`, `0061`, `007`, `008`, `009`, `010`, `011`, `012`, `013`.
- Prevention Rule: When pushing Supabase migrations to an existing project, assume replay against pre-existing objects and make historical migrations idempotent, keep version prefixes unique, and repair migration history before retrying.
- Files: `supabase/migrations/001_users.sql`, `supabase/migrations/002_foods.sql`, `supabase/migrations/003_logs.sql`, `supabase/migrations/004_corrections.sql`, `supabase/migrations/0041_saved_meals.sql`, `supabase/migrations/0051_reminders.sql`, `supabase/migrations/0061_subscriptions.sql`, `supabase/migrations/006_activities.sql`, `supabase/migrations/009_push_tokens.sql`, `supabase/migrations/010_logging_events.sql`, `supabase/migrations/011_user_context_events.sql`, `supabase/migrations/012_coach_insights.sql`, `supabase/migrations/013_body_progress.sql`
- Reuse Signal: Recheck this first whenever `supabase db push` fails on an existing project with duplicate objects or a broken migration ledger.

## 2026-05-10 - TS literal widening in mocked response broke controller spec after DTO union types were added

- Scope: backend tests/build
- Error Signature: `TS2345: Type 'string' is not assignable to type 'BodyStatus'` at `calorie-target.controller.spec.ts` when calling `mockReturnValue(expected)`.
- Trigger: `cd apps/backend ; npm test -- calorie-target.service.spec.ts calorie-target.controller.spec.ts` and `cd apps/backend ; npm run build`
- Root Cause: Test fixtures for `CalorieTargetResponse` were plain object literals without explicit typing, so string literals were widened to `string` and no longer matched new union fields (`BodyStatus`, `WeightRecommendation`).
- Fix: Imported `CalorieTargetResponse` in the spec and typed each mocked `expected` payload as `CalorieTargetResponse`.
- Validation: `cd apps/backend ; npm test -- calorie-target.service.spec.ts calorie-target.controller.spec.ts` => pass, `cd apps/backend ; npm run build` => pass.
- Prevention Rule: After introducing DTO union-literal fields, type mock fixtures explicitly (`const expected: Interface = {...}`) or use `as const` to prevent widening.
- Files: `apps/backend/src/modules/calorie-target/__tests__/calorie-target.controller.spec.ts`
- Reuse Signal: Check this first whenever mocks fail with `Type 'string' is not assignable to type '<UnionLiteral>'` after response model changes.

## 2026-05-10 - Activity add button looked unresponsive on web/android because add flow used iOS-only prompt

- Scope: mobile
- Error Signature: Clicking `+` in Activity section produced no usable add flow on web/android; code path called `Alert.prompt(...)` from `app/(tabs)/log.tsx` even though prompt input is iOS-only.
- Trigger: Open mobile web (`localhost:19006`) and press the Activity `+` button.
- Root Cause: `handleAddActivity` relied on `Alert.prompt` for entering minutes after selecting an activity type, but that API is not a cross-platform input mechanism.
- Fix: Added platform-specific add flows in `handleAddActivity`: web uses `globalThis.prompt`, android uses quick minute preset buttons (15/30/45), iOS keeps `Alert.prompt`; centralized write path via `submitQuickActivity`.
- Validation: `cd apps/mobile ; npm run lint`.
- Prevention Rule: Do not use `Alert.prompt` as the only input path for features expected to run on web/android; always provide platform-safe fallbacks for user input.
- Files: `apps/mobile/app/(tabs)/log.tsx`
- Reuse Signal: Recheck this first whenever an action button on mobile web appears clickable but does not open an input flow.

## 2026-05-10 - Roadmap delete button on web looked clickable but executed no removal

- Scope: mobile web
- Error Signature: Pressing `Xóa bài` in `Lộ trình tập hôm nay` produced no visible action on web; no confirm callback fired and task stayed in list.
- Trigger: Open `app/(tabs)/index.tsx` on web (`localhost:19006`) and press roadmap `Xóa bài` button.
- Root Cause: The delete flow relied on `Alert.alert(..., buttons)` callback handling, but React Native Web does not provide reliable multi-button callback behavior equivalent to native alert dialogs.
- Fix: Added platform-safe branching in `handleRemoveRoadmapTask`: on web use `globalThis.confirm(...)` and execute removal directly; on iOS/Android keep `Alert.alert` with destructive callback.
- Validation: `cd apps/mobile ; npx tsc --noEmit`.
- Prevention Rule: For destructive confirmation actions in React Native screens that run on web, do not depend solely on `Alert.alert` button callbacks; provide explicit web confirmation path (`confirm` or custom modal) with direct action execution.
- Files: `apps/mobile/app/(tabs)/index.tsx`
- Reuse Signal: Recheck this first whenever a web button appears tappable but its confirm/delete action never executes.

## 2026-05-10 - Daily roadmap state drift and local-day mismatch across tabs after partial backend migration

- Scope: mobile + backend
- Error Signature:
	- Functional regression: roadmap tasks added/removed in `app/(tabs)/index.tsx` and `app/(tabs)/log.tsx` became inconsistent because one tab still used local-only custom state.
	- Functional regression: daily data queries used UTC date conversion (`toISOString().split('T')[0]`) causing off-by-one day results around local midnight.
	- Build/type regression introduced during fix: `TS1016: A required parameter cannot follow an optional parameter` in `src/modules/log/log.controller.ts` and downstream spec mismatch `TS2554: Expected 3 arguments, but got 2` in `src/modules/log/__tests__/log.controller.spec.ts`.
- Trigger:
	- Feature audit and immediate remediation pass (`làm luôn`) across roadmap/day-boundary logic.
	- Validation commands: `cd apps/backend ; npm run build`, `cd apps/backend ; npm test -- log.controller.spec.ts`, `cd apps/mobile ; npx tsc --noEmit`.
- Root Cause: Roadmap persistence strategy was split across screens (backend-backed in one tab, transient local state in another), and date handling mixed user-local semantics with UTC-derived day keys; controller query extension added an optional parameter before required `req`, then tests still asserted the old service call signature.
- Fix:
	- Unified roadmap handling in Log tab to use backend `dailyRoadmap` with `addRoadmapItem`/`deleteRoadmapItem`, including persisted removal markers (`removed:<baseTaskId>`).
	- Added/propagated local date helpers and timezone offset query support (`tz_offset_minutes`) so backend computes UTC ranges from user local day.
	- Removed weekly adherence cap logic so insights reflect true percentage.
	- Reordered controller parameters and updated controller spec expectations for timezone-offset argument.
- Validation:
	- `cd apps/mobile ; npx tsc --noEmit` (pass)
	- `cd apps/backend ; npm run build` (pass)
	- `cd apps/backend ; npm test -- log.controller.spec.ts` (pass, 3/3 tests)
- Prevention Rule: For any "daily" feature, enforce one canonical local-day contract end-to-end (client date key + timezone offset + server range derivation) and avoid per-screen shadow state for entities persisted in backend.
- Files: `apps/mobile/app/(tabs)/log.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/store/log.store.ts`, `apps/mobile/services/date.ts`, `apps/mobile/app/(tabs)/progress.tsx`, `apps/mobile/services/activity-sync.service.ts`, `apps/mobile/app/health-sync.tsx`, `apps/backend/src/modules/log/log.controller.ts`, `apps/backend/src/modules/log/log.service.ts`, `apps/backend/src/modules/log/__tests__/log.controller.spec.ts`, `apps/backend/src/modules/insights/insights.service.ts`
- Reuse Signal: Recheck this first whenever "today" totals differ by timezone or the same roadmap entity behaves differently between tabs.

## 2026-05-10 - AI coach returned 500 after key setup due Gemini quota=0 and dev startup intermittently failed via Turbo

- Scope: backend AI + tooling
- Error Signature:
	- `POST /ai/coach` returned `500 Internal server error`
	- Backend log: `[GoogleGenerativeAI Error] ... [429 Too Many Requests] ... Quota exceeded ... limit: 0`
	- Dev startup via root script: `× Could not resolve workspaces. Missing packageManager field in package.json`
- Trigger:
	- After setting `GEMINI_API_KEY` and running end-to-end coach validation (`auth/register -> auth/login -> ai/coach`).
	- Running `npm run backend` from workspace root under Turbo 2.9.9.

## 2026-06-10 - Telemetry accepted raw PII and image URLs while AI uploads preserved image metadata

- Scope: backend privacy/security
- Error Signature: Privacy review finding: telemetry accepted `scan_image_url`, free-form `notes`, and arbitrary `metadata`, while `/ai/scan/image` and `/ai/scan/receipt` forwarded original image bytes without stripping EXIF/text metadata.
- Trigger: Security hardening review for telemetry and image upload flows.
- Root Cause: Telemetry service inserted raw event payloads directly into Supabase, and AI upload controller converted raw file buffers to base64 without a metadata scrub step.
- Fix: Added centralized telemetry sanitizers to redact PII-like free text, drop direct image URLs/sensitive metadata keys, and strip image metadata (JPEG EXIF, PNG text/eXIf chunks) before sending uploads to AI providers; also removed `scan_image_url` from the correction-event DTO and added a migration to drop the column.
- Validation: `cd apps/backend ; npx jest src/modules/telemetry/__tests__/telemetry.service.spec.ts src/common/privacy/__tests__/image-privacy.util.spec.ts --runInBand`, `cd apps/backend ; npm run build`
- Prevention Rule: Never persist raw telemetry free text or image URLs directly; route telemetry through a server-side sanitizer and strip metadata from user-uploaded media before any storage or provider handoff.
- Files: `apps/backend/src/common/privacy/telemetry-privacy.util.ts`, `apps/backend/src/common/privacy/image-privacy.util.ts`, `apps/backend/src/modules/telemetry/telemetry.service.ts`, `apps/backend/src/modules/telemetry/telemetry.controller.ts`, `apps/backend/src/modules/ai/ai.controller.ts`, `supabase/migrations/022_remove_scan_image_url_from_corrections.sql`
- Reuse Signal: Recheck this first whenever adding a telemetry field, free-form notes, media URL, or a new image upload endpoint.

## 2026-05-10 - Expo image picker deprecation fix broke mobile typecheck because installed typings lag runtime API

- Scope: mobile
- Error Signature:
	- Browser warning: `[expo-image-picker] ImagePicker.MediaTypeOptions have been deprecated. Use ImagePicker.MediaType or an array of ImagePicker.MediaType instead.`
	- Typecheck failure: `TS2339: Property 'MediaType' does not exist on type 'typeof import(".../expo-image-picker/build/ImagePicker")'` at `app/(tabs)/scan.tsx`
- Trigger:
	- `cd apps/mobile ; npm run lint`
	- Manual scan/gallery upload hardening on web/mobile.
- Root Cause: The installed `expo-image-picker` runtime warns against `MediaTypeOptions`, but this repo's current type definitions do not yet expose `ImagePicker.MediaType`, so a direct migration fixed the warning path while breaking TypeScript.
- Fix: Replaced direct enum usage in `scan.tsx` with a compatible media type array constant (`['images'] as any`) so the code avoids the deprecated option shape without depending on typings that are not present in the installed package version.
- Validation: `cd apps/mobile ; npm run lint` => pass.
- Prevention Rule: When Expo warns about a replacement API, verify the installed package's type surface before switching call sites; if typings lag runtime, prefer a small compatibility wrapper/constant over direct use of the advertised symbol.
- Files: `apps/mobile/app/(tabs)/scan.tsx`
- Reuse Signal: Recheck this whenever Expo runtime deprecation guidance mentions a symbol that TypeScript cannot resolve in the currently installed SDK package.
- Root Cause:
	- API key was valid, but Gemini project quota for `generateContent` was effectively unavailable (`limit: 0`), and `getCoachReply()` did not catch provider errors, so exceptions bubbled to 500.
	- Root `package.json` lacked `packageManager`, which Turbo now requires to resolve workspaces in this environment.
- Fix:
	- Added try/catch in `AiService.getCoachReply()` and returned a safe Vietnamese fallback response when error indicates quota/rate-limit (`429`, `quota exceeded`, `too many requests`).
	- Switched AI model from `gemini-2.0-flash` to `gemini-2.5-flash` across AI service after validating the configured key can generate content on 2.5.
	- Added root metadata: `"packageManager": "npm@10"`.
- Validation:
	- `GET /health` => `200`.
	- Backend boot successful on `http://localhost:3000` after clean restart.
	- `POST /ai/coach` E2E (`auth/register -> auth/login -> ai/coach`) now returns `200` with real coach text on `gemini-2.5-flash`; quota/rate fallback remains active as safety net.
- Prevention Rule: Treat LLM provider calls as unreliable I/O: always guard with explicit fallback paths for quota/rate failures, and keep root workspace metadata (`packageManager`) aligned with current Turbo requirements.
- Files: `apps/backend/src/modules/ai/ai.service.ts`, `package.json`
- Reuse Signal: Recheck this first whenever AI endpoints start failing immediately after key rotation/config changes or Turbo suddenly stops resolving workspaces.

## 2026-05-10 - Coach UI masked real failures with generic "connection interrupted" message

- Scope: mobile UI
- Error Signature: In Coach tab, any error path (feature-gate denied, auth expired, backend 5xx, network issue) displayed the same message: `Xin loi, toi dang bi gian doan ket noi. Ban thu lai sau it phut nhe.`
- Trigger: Sending chat in `app/(tabs)/coach.tsx` while account lacks `ai_coach` feature or when request fails for non-network reasons.
- Root Cause: `handleSend()` had a broad `catch { ... }` and always appended one generic fallback text, hiding the real reason and making troubleshooting misleading.
- Fix: Added `getCoachErrorMessage(error)` to map errors into specific user-facing messages (premium gate, 401 session expiry, backend 5xx detail, network error fallback), and wired `catch (error)` to use that mapper.
- Validation: UI still receives normal AI responses on success; failure paths now surface actionable reasons instead of a single generic message.
- Prevention Rule: Never swallow chat/API exceptions with a single generic catch message in product UI. Preserve category-level error context for auth, entitlement, backend, and network failures.
- Files: `apps/mobile/app/(tabs)/coach.tsx`
- Reuse Signal: Recheck this whenever support reports "khong hoat dong" but backend health/API tests look normal.

## 2026-05-10 - Native app showed red LogBox because Expo push token registration ran without projectId

- Scope: mobile native
- Error Signature: `[Push] Failed to initialize: Error: No "projectId" found. If "projectId" can't be inferred from the manifest (for instance, in bare workflow), you have to pass it in yourself.`
- Trigger: Launching the logged-in app on iPhone while `pushNotificationService.initializePushNotifications()` ran from auth store startup/login/register.
- Root Cause: The push notification service called `Notifications.getExpoPushTokenAsync()` without an explicit `projectId`, and this app config does not currently expose `extra.eas.projectId`; the catch block then used `console.error`, which promoted the setup problem into a red LogBox.
- Fix: Added a `getExpoProjectId()` helper using `Constants.easConfig?.projectId` and `Constants.expoConfig?.extra?.eas?.projectId`, skipped token registration entirely when no project ID is configured, and downgraded the catch path from `console.error` to `console.warn`.
- Validation: `cd apps/mobile ; npm run lint` => pass.
- Prevention Rule: Any Expo push token registration path must either provide an explicit EAS `projectId` or treat missing project metadata as a non-fatal configuration gap instead of logging a runtime error.
- Files: `apps/mobile/services/push-notification.service.ts`
- Reuse Signal: Recheck this first whenever native Expo builds show push notification initialization errors during login or app bootstrap.

## 2026-05-10 - Dynamic Expo config injection hit TypeScript narrowing on imported app.json

- Scope: mobile config/build
- Error Signature: `TS2339: Property 'extra' does not exist on type ...` in `app.config.ts` during `cd apps/mobile ; npm run lint`.
- Trigger: Adding dynamic Expo config to inject `EXPO_PUBLIC_EAS_PROJECT_ID` into `extra.eas.projectId`.
- Root Cause: TypeScript inferred `appJson.expo` from the current static `app.json` shape, which does not declare an `extra` field even though Expo will merge/use it at runtime.
- Fix: Widened the imported config shape locally with a narrow cast before reading/writing `extra.eas.projectId`.
- Validation: `cd apps/mobile ; npm run lint` => pass, `cd apps/mobile ; npx expo config --json` => pass.
- Prevention Rule: When layering dynamic Expo config on top of static `app.json`, widen the imported config type explicitly before accessing optional fields that are not present in the source JSON yet.
- Files: `apps/mobile/app.config.ts`
- Reuse Signal: Recheck this whenever a new optional Expo config branch is injected from env through `app.config.ts`.

## 2026-05-10 - Native mobile requests hit localhost and roadmap fetch surfaced as Network Error LogBox

- Scope: mobile native
- Error Signature: `Failed to fetch daily roadmap: AxiosError: Network Error` shown in native LogBox while calling `fetchDailyRoadmap` from `apps/mobile/store/log.store.ts`.
- Trigger: Opening the app on iPhone in Expo/Expo Go after roadmap fetch was added.
- Root Cause: `apps/mobile/services/api.ts` used `EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'` directly; in native dev, any stale bundle or missing env propagation leaves `localhost`, which points to the phone itself rather than the dev machine.
- Fix: Added native-only base URL resolution that derives the Expo host from `expo-constants` (`expoConfig.hostUri` / `linkingUri` / `experienceUrl`) and rewrites loopback API URLs to `http://<expo-host>:3000`. Also downgraded roadmap fetch logging from `console.error` to `console.warn` to avoid red LogBox for a recoverable connectivity miss.
- Validation: `cd apps/mobile ; npm run lint` => pass.
- Prevention Rule: In Expo native dev, never rely on `localhost` as the API origin. Either inject a LAN URL explicitly or derive the dev host from the running Expo manifest/session metadata.
- Files: `apps/mobile/services/api.ts`, `apps/mobile/store/log.store.ts`
- Reuse Signal: Recheck this whenever native iOS/Android reports Axios `Network Error` while web works against the same backend.

## 2026-05-10 - Backend watch compile failed after refine DTO made summary optional

- Scope: backend AI
- Error Signature: `TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'` at `src/modules/ai/ai.controller.ts:95` during backend watch startup.
- Trigger: Restarting backend after making `RefineScanDto.original_items_summary` optional to fix request validation.
- Root Cause: The DTO contract was widened to allow `original_items_summary?: string`, but `AiService.refineScan(...)` still required a non-optional `string`, so the controller call no longer typechecked.
- Fix: Updated `AiService.refineScan(...)` to accept `string | undefined` and normalize a missing summary to a safe fallback sentence before composing the Gemini prompt.
- Validation: VS Code diagnostics for `apps/backend/src/modules/ai/ai.service.ts` and `apps/backend/src/modules/ai/ai.controller.ts` => no errors.
- Prevention Rule: When relaxing a DTO field from required to optional, immediately propagate the same optionality through the service boundary or add normalization at the controller edge.
- Files: `apps/backend/src/modules/ai/ai.service.ts`, `apps/backend/src/modules/ai/ai.controller.ts`
- Reuse Signal: Recheck this whenever a DTO validation fix is followed by a new TypeScript mismatch in the owning controller/service pair.

## 2026-05-10 - Backend ready script failed on Windows because Nest watch crashed with tree-kill spawn UNKNOWN

- Scope: backend tooling
- Error Signature: `Error: spawn UNKNOWN` from `node_modules/tree-kill/index.js` while running `nest start --watch`, surfaced through `npm error Lifecycle script dev failed` during `npm run dev:backend:ready`.
- Trigger: Restarting backend on Windows after code changes.
- Root Cause: The ready script used watch mode (`npm run dev` -> `nest start --watch`) even though its job is just to bring the backend back up; on this Windows/Node 24 environment the Nest watch process crashes inside `tree-kill` during restart handling.
- Fix: Changed `scripts/start-backend-dev.ps1` to build once with `npm run build` and then launch `node dist/apps/backend/src/main` in the background, keeping the same readiness probe against `http://localhost:3000/api/docs`.
- Validation: `npm run dev:backend:ready` => `Backend ready on http://localhost:3000`.
- Prevention Rule: On this repo's Windows setup, use build-then-run for ready/restart automation; reserve `nest start --watch` for manual interactive development only.
- Files: `scripts/start-backend-dev.ps1`, `apps/backend/package.json`
- Reuse Signal: Recheck this first whenever backend startup fails with `tree-kill`, `spawn UNKNOWN`, or only crashes in watch mode on Windows.

## 2026-05-10 - Web bundle called LAN backend URL and showed connection refused after Expo-native API fallback work

- Scope: mobile web
- Error Signature: Browser console showed `192.168.0.100:3000/... Failed to load resource: net::ERR_CONNECTION_REFUSED` plus `Failed to fetch daily roadmap: AxiosError: Network Error` while the app was opened on `http://localhost:19006`.
- Trigger: Running the web app locally after updating the shared API client to support Expo/native LAN fallback.
- Root Cause: The shared API client still honored `EXPO_PUBLIC_API_URL=http://192.168.0.100:3000` on web, so the localhost-served browser app unnecessarily called the LAN address instead of `localhost:3000`.
- Fix: Updated `apps/mobile/services/api.ts` so web prefers `http://<window.location.hostname>:3000` when the page itself is loaded from `localhost`/`127.0.0.1`, while native Expo keeps the LAN fallback logic.
- Validation: `cd apps/mobile ; npm run lint` => pass.
- Prevention Rule: When one API client is shared between Expo native and web, resolve the backend origin per platform/runtime instead of forcing a LAN URL from env onto localhost-served web sessions.
- Files: `apps/mobile/services/api.ts`
- Reuse Signal: Recheck this whenever web shows `ERR_CONNECTION_REFUSED` to a private LAN IP after adding native-device networking fallbacks.


## 2026-05-20 - Local AI scan returned 500 due to invalid Gemini API key during dev test

- Scope: backend AI (dev)
- Error Signature: `Error: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] API key not valid. Please pass a valid API key.`
- Trigger: `POST /ai/scan/image` from local web test (upload raw/resized image) while `GEMINI_API_KEY` is invalid and `AI_SIMULATE_LOCAL_RESPONSE` was not set in the environment.
- Root Cause: The service attempted to call the real Gemini provider with an invalid API key. Local dev simulation (reading `tmp/ai_debug_response.json`) was implemented but not enabled in the runtime `.env`, so the code fell through to provider calls and threw.
- Fix: For local testing without a valid provider key, set `AI_SIMULATE_LOCAL_RESPONSE=true` (and optionally `AI_SIMULATED_LATENCY_MS`) in `apps/backend/.env` or export them in the shell before starting the backend. The code already includes a simulation branch that returns the recorded `tmp/ai_debug_response.json` when enabled.
- Validation: Restart the backend with simulation enabled and re-run the image upload test; the endpoint should return a simulated `AIScanResponse` rather than a 500.
- Prevention Rule: Developers testing LLM endpoints locally must either provide a valid `GEMINI_API_KEY` or enable `AI_SIMULATE_LOCAL_RESPONSE=true` in local env; CI should mock provider calls for deterministic tests.
- Files: `apps/backend/src/modules/ai/ai.service.ts`, `apps/backend/.env`, `tmp/ai_debug_response.json`

> Update 2026-06-21: simulation mode now has a built-in valid fixture. `tmp/ai_debug_response.json` remains an optional override and is no longer required for CI/local simulation.

## 2026-05-11 - AI scan/refine returned 500 when Gemini quota was exhausted

- Scope: backend AI + mobile web UX
- Error Signature: `POST /ai/scan/refine -> 500 Internal Server Error` and backend stack `Error: [GoogleGenerativeAI Error] ... [429 Too Many Requests] ... Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, model: gemini-2.5-flash`.
- Trigger: Running scan/refine flows from Scan tab while Gemini free-tier quota was exhausted.
- Root Cause: AI scan endpoints (`scanImage`, `scanText`, `scanVoice`, `scanReceipt`, `refineScan`) rethrew Gemini 429 quota/rate-limit errors, so Nest converted them into 500 responses instead of returning a safe degraded payload.
- Fix: Added quota/rate-limit fallback handling across scan/refine endpoints in `AiService` and returned a structured empty `AIScanResponse` with `metadata.ai_fallback=quota_or_rate_limited` instead of throwing 500; removed temporary debug log noise in mobile scan remove-item handler.
- Validation: Reproduced live backend error signature from logs (`Gemini ... 429 Too Many Requests`), then re-tested APIs after fix: `POST /ai/scan/text` => `200` with fallback payload, `POST /ai/scan/refine` => `200` with fallback payload (no 500).
- Prevention Rule: For all LLM-backed endpoints (not only coach chat), treat provider 429/quota failures as expected runtime conditions and return explicit degraded responses rather than uncaught exceptions.
- Files: `apps/backend/src/modules/ai/ai.service.ts`, `apps/mobile/app/(tabs)/scan.tsx`
- Reuse Signal: Recheck this first whenever AI endpoints suddenly flip from normal behavior to 500 with durations around 1-5s and provider quota/rate warnings appear in backend logs.

## 2026-05-12 - Expo web started on port 19006 (one dev session failed, new web server up)

## 2026-05-22 - Backend restart loop from unhandled fetch failures during Supabase client init

- Scope: backend (startup)
- Error Signature: `UNHANDLED_REJECTION { message: 'TypeError: fetch failed', details: 'AggregateError (ECONNREFUSED)' }` appearing repeatedly during Nest bootstrap and causing container restart loops.
- Trigger: `docker compose up` with default env in `docker-compose.yml` where `SUPABASE_URL` was set to `http://localhost:5432` (Postgres port) and `SUPABASE_SERVICE_KEY` present. Supabase client attempted HTTP fetches against a Postgres listener and failed.
- Root Cause: The app created a Supabase JS client unconditionally on module init. In local setups that only run raw Postgres (no Supabase HTTP layer), the Supabase client issues background `fetch()` requests to the configured `SUPABASE_URL`. Pointing that URL to `localhost:5432` caused immediate ECONNREFUSED errors that surfaced as unhandled promise rejections and crashed the process.
- Fix: Hardened `SupabaseService.onModuleInit()` to:
	- use non-throwing config getters,
	- validate `SUPABASE_URL` (skip client creation when it looks like a Postgres port or is an invalid URL),
	- wrap `createClient()` in try/catch,
	- provide a lightweight stub client (`db.from(...).select(...)` etc.) when Supabase is not configured or appears misconfigured to avoid background network activity and to let the server start for local AI/debug work.
- Validation: Restarting the backend with the same compose env no longer produced the repeated `UNHANDLED_REJECTION` logs; the server boot sequence completes and health endpoints become reachable when Supabase is intentionally unavailable for local dev.
- Prevention Rule: Do not default `SUPABASE_URL` to a raw Postgres listener (e.g., `http://localhost:5432`). Require an explicit Supabase HTTP endpoint or guard client creation; supply a stub client in dev to avoid background I/O during startup. When introducing third-party clients that may perform background network activity, validate the target URL early and fail gracefully in development.
- Files: `apps/backend/src/common/supabase/supabase.service.ts`, `docker-compose.yml`

- Scope: mobile tooling / dev-server
- Error Signature: One running dev terminal showed `npm error Lifecycle script `dev` failed with error: npm error code 4294967295` while a new Expo web process was started and is listening on port 19006.
- Trigger: Starting Expo dev (web) after freeing ports via helper script; observed when running `npm run dev` or the helper scripts that start Expo.
- Reproduction (exact):
	- Killed existing Expo-related processes matching `expo` in command line.
	- Started Expo web with: `npm exec expo -- start --web --port 19006 --clear --non-interactive`.
	- Observed netstat: port 19006 LISTENING with PID 23876.
	- Another terminal (previous `npm run dev`) printed Metro output and warnings then exited with `npm error Lifecycle script 'dev' failed`.

- Observation / Root Cause: The failing `npm run dev` session exited with a generic npm error code; however a separate Expo web process was successfully started and is listening on `http://localhost:19006`. The failing terminal logged Metro bundles, warnings (package exports fallback, expo-notifications notes) and a Push token registration before the error. Root cause appears transient (expo/cli or environment), not a deterministic code compile error.
- Action Taken: Killed stale Expo processes, launched a fresh Expo web process, waited for port 19006 to become available, and confirmed listening via `netstat`.
- Validation: `netstat -aon` shows port 19006 LISTENING (PID 23876). Backend and Metro remain running; quick health checks show backend OK and Metro on 8081.
- Recommended next steps: Open the new Expo web terminal window (the one started by the helper) and inspect full runtime logs for the process with PID 23876 if the error recurs; if reproducible, capture the Expo CLI logs and consider updating `expo`/`@expo/metro` packages or investigating environment PATH conflicts.
- Files: `scripts/start-all.ps1`, `scripts/restart-verify.ps1`, `apps/mobile/package.json`
- Reuse Signal: Re-run port-clean + restart (scripts) first whenever Expo web fails to start or `npm run dev` exits with a non-zero lifecycle code; collect full terminal logs for persistent failures.

## 2026-05-12 - `restart-verify.ps1` falsely reported backend build failure

- Scope: tooling / scripts
- Error Signature: `Backend build failed (exit ). Aborting.` (printed by `scripts/restart-verify.ps1` when run interactively)
- Trigger: Running `.\	emplates\scripts\restart-verify.ps1` (actually `.\	emplates` is a mistaken path—see reproduction) or simply `cd calorie-ai-vn; .\scripts\restart-verify.ps1`
- Reproduction (exact):
	- Run from repository root: `.\scripts
estart-verify.ps1`
	- Script output snippet:

```
Workspace: C:\Users\VuNH44\calorie-ai-vn
Backend: C:\Users\VuNH44\calorie-ai-vn\apps\backend
Options => Build:True  RunTests:False  SkipVerify:False  NoOpenWindows:False

[1/3] Building backend...
Backend build failed (exit ). Aborting.
```

- Root Cause: The script used `Start-Process -FilePath npm -ArgumentList "run","build" -NoNewWindow -Wait -PassThru` and then inspected `$proc.ExitCode`, but in the active VS Code PowerShell session `Start-Process` returned an empty/null PassThru object (or ExitCode was not populated), causing the script to treat a missing exit code as a failure. Running `npm run build` directly in the same shell returns `EXIT:0` and produces a successful build, so the underlying build itself is fine—the detection logic is faulty.
- Fix: Change the script to run CLI commands inline (e.g. `& npm run build`) and check `$LASTEXITCODE` after the command, or redirect stdout/stderr to files and inspect them. Also add clearer logging when PassThru is null.
- Validation: After the fix, running `.\scripts\restart-verify.ps1` should proceed past the build step and continue to restart backend and Expo; direct `npm run build` returns `EXIT:0` and produces `dist/apps/backend` as expected.
- Prevention Rule: In Windows PowerShell automation scripts for this repo, prefer inline invocation and `$LASTEXITCODE` checks for Node/npm CLIs instead of relying on `Start-Process -PassThru` for exit status across shells.
- Files: `scripts/restart-verify.ps1`
- Reuse Signal: Recheck this pattern whenever a PowerShell helper uses `Start-Process -PassThru` to run `npm`/`node` CLIs; prefer `$LASTEXITCODE` or capture stdout/stderr files.

## 2026-05-22 - Supabase realtime WebSocket error on Node 20 in Docker

- Scope: backend (Supabase client)
- Error Signature: `/app/node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js:103\nError: Node.js 20 detected without native WebSocket support.\nSuggested solution: For Node.js < 22, install "ws" package and provide it via the transport option: import ws from "ws" new RealtimeClient(url, { transport: ws })`
- Trigger: Starting the backend inside the Docker image built from `node:20-alpine`.
- Root Cause: `@supabase/supabase-js`'s realtime client requires an explicit WebSocket transport when running on Node.js versions that don't provide a global WebSocket implementation (Node < 22). Without a provided transport, the RealtimeClient throws synchronously during `createClient(...)` initialization.
- Fix: Added `ws` to `apps/backend/package.json` and updated `apps/backend/src/common/supabase/supabase.service.ts` to detect and pass `ws` as the `realtime.transport` option when available (runtime `require('ws')`). This prevents the synchronous error and allows the Supabase client to initialize in Node 20 container images.
- Validation: Rebuilt the backend image and restarted the container; backend logs no longer show the WebSocket constructor error and Nest routes map successfully.
- Prevention Rule: In Node < 22 environments, ensure `ws` is present and pass it to `createClient(url, key, { realtime: { transport: ws } })`. Add a short integration smoke test in CI that starts the backend image and asserts `/health` responds to catch this early.
- Files: `apps/backend/package.json`, `apps/backend/src/common/supabase/supabase.service.ts`, `docker-compose.yml`

## 2026-06-21 — npm registry ECONNRESET during GitHub Actions

- **Symptom:** `npm ci` failed while fetching `@firebase/logger` with
  `ECONNRESET` and `Invalid response body ... aborted`.
- **Classification:** transient npm registry/network failure; not a source-code,
  lockfile, Node version, or dependency deprecation failure.
- **Evidence:** other parallel jobs installed the same lockfile successfully in
  the same workflow run.
- **Mitigation:** npm fetch retries plus a bounded three-attempt install loop
  with backoff in the affected CI job.
- **Rule for future incidents:** inspect the exact failed step before upgrading
  packages. Deprecation warnings printed before a network reset are not the
  root cause.
- **Follow-up:** new dependency-install workflow steps must apply bounded retry
  behavior and must still fail after the final attempt.

## 2026-06-22 - Payment issue cards referenced a theme variable outside component scope

- Scope: mobile admin UI
- Error Signature: `ReferenceError: colors is not defined` in `IssueCard` at
  `apps/mobile/app/admin/payment-issues.tsx`, triggered while mapping
  `response.issues`.
- Trigger: Rendering one or more payment issue cards containing the internal
  note and user-facing resolution inputs.
- Root Cause: `colors` was destructured inside `AdminPaymentIssuesScreen`, but
  `IssueCard` is a separate component and referenced `colors.textMuted` without
  receiving that value or calling the theme hook in its own scope.
- Fix: Passed the resolved `colors.textMuted` token into each `IssueCard` as a
  typed `placeholderColor` prop and used it for both `TextInput` placeholders.
- Validation: `npm --workspace apps/mobile run lint` no longer reports
  `payment-issues.tsx`; the command remains blocked by pre-existing unrelated
  errors in `app/(tabs)/profile.tsx` and `app/(tabs)/scan.tsx`.
- Prevention Rule: A nested React component must receive theme tokens through
  props or resolve them with its own hook; never rely on lexical variables
  declared inside the parent component function.
- Files: `apps/mobile/app/admin/payment-issues.tsx`
- Reuse Signal: Check component scope first whenever a runtime
  `ReferenceError: <theme variable> is not defined` occurs inside a mapped card
  or extracted render component.
