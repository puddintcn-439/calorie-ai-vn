# Product Loop Closure Plan

## Goal

Turn the current MVP from "many useful features" into a tighter weight-management assistant where each important feature creates a clear next action.

Primary product loop:

`Profile -> target calories -> scan/log/activity -> Today dashboard -> coach/insights/progress -> plan adjustment`

This loop already exists. The work below closes the weaker links around coach actions, upgrade routing, planning visibility, reminder outcomes, and scan correction feedback.

## Product Verdict

The assessment is correct.

The current system is strong enough for MVP/private beta functionally. It has the right core pillars: profile, calorie target, scan, food log, activity log, Today dashboard, progress tracking, insights, coach, reminders, subscription, and health sync architecture.

The remaining gap is product continuity, not a missing core module. The app should make the next step obvious after each recommendation, block, reminder, or correction.

## Phase 1: Quick Loop Wins

### 1. Upgrade routing from blocked premium features

Problem:
Premium-gated features can fail as plain errors. This is especially visible in AI Coach and Health Sync.

Implementation:

- Add a shared helper to detect feature-gating errors from `featureGatingService.requireFeature`.
- In Coach, when AI Coach is blocked, show a compact upgrade card inside the chat area with a primary CTA to `/paywall`.
- In Health Sync, when `healthkit_sync` is blocked, route to `/paywall` or show a dedicated upgrade CTA.
- Add optional `returnTo` query support for Paywall so users can come back to Coach/Health Sync after changing tier.

Likely files:

- `apps/mobile/services/feature-gating.service.ts`
- `apps/mobile/services/ai.service.ts`
- `apps/mobile/app/(tabs)/coach.tsx`
- `apps/mobile/app/health-sync.tsx`
- `apps/mobile/app/paywall.tsx`

Acceptance criteria:

- Free user tapping AI Coach does not see only an error.
- User sees why the feature is premium and can go directly to Paywall.
- After upgrade/trial tier switch, returning to the original feature reloads feature access.

### 2. Scan correction feedback

Problem:
Correction telemetry exists, but users do not feel that edits improve the product.

Implementation:

- When users adjust scan item portion/name or refine a low-confidence result, show a short "correction saved" feedback state.
- Surface a small quality note on Scan after correction: "Lan sau minh se uu tien cach ban sua mon nay" or equivalent localized text.
- Keep telemetry fire-and-forget; do not block logging on telemetry failure.

Likely files:

- `apps/mobile/app/(tabs)/scan.tsx`
- `apps/mobile/services/telemetry.service.ts`
- `packages/types/src/telemetry.types.ts` only if type additions are needed.

Acceptance criteria:

- Portion/name corrections emit telemetry.
- User receives visible confirmation.
- Failed telemetry does not break scan save.

## Phase 2: Coach-To-Action

### 3. Structured coach actions

Problem:
Coach replies are useful, but they do not create concrete app actions.

Implementation:

- Extend `AICoachResponse` with optional `actions`.
- Start conservative: support client-derived actions from message/context before trusting AI-generated actions.
- Action types:
  - `open_scan`
  - `open_log`
  - `add_activity`
  - `update_goal_plan`
  - `open_reminders`
  - `open_progress`
- Render action chips/cards below coach replies.
- Only allow one-tap mutations for low-risk actions such as add activity with explicit preview.
- For goal/profile updates, route user to Profile with prefilled context or show confirmation first.

Likely files:

- `packages/types/src/ai.types.ts`
- `apps/backend/src/modules/ai/ai.service.ts`
- `apps/backend/src/modules/ai/ai.controller.ts`
- `apps/mobile/services/ai.service.ts`
- `apps/mobile/app/(tabs)/coach.tsx`
- `apps/mobile/store/log.store.ts`

Acceptance criteria:

- Coach can answer and show 1-3 relevant next-action buttons.
- "Log next meal" opens Scan.
- "Add walk/activity" creates or previews an activity log and refreshes Today/Log.
- Goal-changing suggestions never silently mutate profile.

### 4. Coach insights become tasks

Problem:
Coaching insights can be acknowledged, but acknowledgement is not tied to action.

Implementation:

- Add action CTA on insight cards based on insight type and affected meal/activity.
- Examples:
  - Skipped meal insight -> open Scan with meal hint.
  - Inconsistent logging -> open reminder settings.
  - Weekend variance -> open planning section.
- Keep `acknowledge` separate from "act on this" so the user can dismiss or execute.

Likely files:

- `apps/mobile/app/(tabs)/coach.tsx`
- `apps/mobile/app/(tabs)/scan.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`

Acceptance criteria:

- Each visible insight has a meaningful CTA or no CTA by design.
- Acting on an insight routes to the right screen.
- Acknowledging does not remove the ability to complete the recommended action in the same session unless intentionally dismissed.

## Phase 3: Planning/Roadmap Surface

### 5. Make Roadmap visible as a daily plan

Problem:
Roadmap/activity planning exists but is scattered between Profile, Log, and Today movement recommendations.

Implementation:

- Create a dedicated `plan` screen or make a stronger Today section named "Ke hoach hom nay".
- Show:
  - calorie target
  - consumed
  - remaining
  - planned activity kcal/min
  - completed activity count
  - next suggested meal/action
  - days/progress toward active goal plan when available
- Reuse existing `dailyRoadmap`, `activityPreferences`, `dailyLog`, `activityLogs`, and `goal_plan`.
- Add CTA from Today, Coach, and Profile to this planning surface.

Likely files:

- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/(tabs)/log.tsx`
- Optional new route: `apps/mobile/app/plan.tsx` or `apps/mobile/app/(tabs)/plan.tsx`
- `apps/mobile/store/log.store.ts`

Acceptance criteria:

- User can answer "today I need to eat/move how much?" from one surface.
- Completing planned movement writes activity log and refreshes Today/Log.
- Profile activity preferences remain source of truth for recurring preferred activities.

### 6. Goal plan countdown

Problem:
Goal plan is saved, but the app does not strongly show timeline/progress toward it.

Implementation:

- On Today/Plan/Profile, calculate and display:
  - goal direction
  - target kg change
  - duration weeks
  - approximate days remaining if start/end dates exist
  - computed target kcal and safety warnings
- Do not overclaim weight outcome; frame as plan adherence, not guaranteed result.

Likely files:

- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- `packages/types/src/user.types.ts`

Acceptance criteria:

- Active goal plan is visible outside Profile.
- Medical/safety warnings remain visible when relevant.

## Phase 4: Reminder Feedback Loop

### 7. Track reminder outcomes

Problem:
Reminder settings exist, push dispatch exists, but product does not measure whether reminders caused logging.

Implementation:

- Add backend table/API or telemetry event for reminder sent/opened/acted.
- When a notification is tapped, deep link with context such as `meal_type` and `reminder_id`.
- When user logs a meal within a window after reminder, record `acted`.
- Show a small reminder effectiveness summary in Profile or Insights.

Likely files:

- `packages/types/src/reminder.types.ts`
- `apps/backend/src/modules/reminder/reminder.scheduler.ts`
- `apps/backend/src/modules/reminder/reminder.controller.ts`
- `apps/backend/src/modules/reminder/reminder.service.ts`
- `apps/mobile/services/push-notification.service.ts`
- `apps/mobile/services/telemetry.service.ts`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/(tabs)/insights.tsx`

Acceptance criteria:

- Backend can record reminder sent/opened/acted events.
- Meal logs can be associated with recent reminder context.
- User sees whether reminders are helping them log more consistently.

### 8. Reminder-to-log deep links

Problem:
Even if reminders fire, they should put the user at the right action.

Implementation:

- Notification tap opens Scan or Log with meal hint.
- Scan defaults selected meal type from deep link context.
- Log can show a quick "log breakfast/lunch/dinner" prompt when opened from reminder.

Likely files:

- `apps/mobile/services/push-notification.service.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(tabs)/scan.tsx`
- `apps/mobile/app/(tabs)/log.tsx`

Acceptance criteria:

- Tapping a meal reminder opens the fastest relevant logging path.
- Meal hint survives navigation.

## Phase 5: Tests And Release Gates

### 9. E2E coverage for closed loops

Add Playwright/mobile-web coverage for:

- blocked AI Coach -> Paywall CTA
- Scan correction -> log saved -> Today updates
- Coach action -> route or activity log created
- Plan surface -> complete activity -> Log and Today refresh
- Profile reminders -> preferences saved

Likely files:

- `apps/mobile/e2e/coach.spec.ts`
- `apps/mobile/e2e/scan-degraded.spec.ts`
- `apps/mobile/e2e/home.spec.ts`
- New: `apps/mobile/e2e/product-loop.spec.ts`

Acceptance criteria:

- Core loop tests pass on Chromium and mobile-chrome project.
- Lint passes for mobile and backend touched packages.

## Suggested Execution Order

1. Upgrade routing and Paywall return flow.
2. Scan correction feedback.
3. Coach action model and UI action chips.
4. Coach insight CTAs.
5. Planning/Roadmap surface.
6. Goal plan countdown.
7. Reminder outcome tracking.
8. Reminder deep links.
9. E2E loop tests and docs update.

## Recommended First Sprint

For the next implementation sprint, do the smallest high-impact set:

1. Blocked premium feature -> Paywall CTA.
2. Coach action chips for `open_scan`, `open_log`, `open_progress`.
3. Scan correction feedback.
4. Today "Plan today" section using existing data.
5. E2E test for these loops.

This closes the most visible gaps without requiring new database schema first.
