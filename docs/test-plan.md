# Calorie AI VN Test Plan

Purpose: keep manual QA, web QA, and release checks consistent after product-loop changes.

## Quick Automated Checks

Run from repo root:

```powershell
npm run lint --workspace=mobile
npm run e2e:ci --workspace=mobile -- auth.spec.ts scan-degraded.spec.ts coach.spec.ts paywall.spec.ts
```

Run broader checks before a release candidate:

```powershell
npm run build --workspace=@calorie-ai/types
npm run lint --workspace=backend
npm run lint --workspace=mobile
npm run e2e:ci --workspace=mobile
```

## Manual Product Loop

Use one seeded/private beta account. Do not leave QA logs behind unless the test is intentionally persistent.

1. Auth
   - Open web/iPhone test link.
   - Login.
   - Confirm no protected API 401 spam before login.

2. Today
   - Today dashboard loads summary, target, remaining calories, movement plan, and roadmap.
   - Empty state is useful when there are no food logs.

3. Scan to Log
   - Open Scan.
   - Text scan a simple meal.
   - Confirm result item, calories, confidence, meal picker, and sticky Log meal action.
   - Tap Log meal.
   - Confirm Today/Log reflects the meal.
   - Delete QA meal.

4. Coach to Action
   - Open Coach.
   - Ask what to do next today.
   - Confirm response includes useful action chips when applicable.
   - Tap Scan/log action and confirm navigation.

5. Planning and Roadmap
   - Open Today.
   - Add or trigger a movement/activity plan.
   - Log matching activity.
   - Confirm roadmap item completes automatically.
   - Delete QA activity/roadmap item.

6. Premium Gates
   - Test a free-tier user.
   - Coach premium block should show Upgrade and route to Paywall with return context.
   - Health Sync premium block should route to Paywall with Health Sync return context.

7. Reminders
   - Open reminder settings.
   - Trigger/open a reminder notification in native build.
   - Confirm opened/acted feedback is recorded when user logs meal/activity soon after reminder.

8. Health Sync
   - Web should show native-build/device limitation clearly.
   - Native iOS/Android build should request permissions and sync activity.

## Release Readiness Checklist

- Supabase migrations applied, including `019_reminder_feedback_loop.sql`.
- Backend health endpoint responds.
- `EXPO_PUBLIC_API_URL` points to the current reachable API host.
- Web HTTPS tunnel/domain is current if testing on iPhone Safari.
- Playwright target tests pass.
- No QA food/activity records remain in the private beta account.
- Known native-only gaps are documented before sharing a web link.
