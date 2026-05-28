# Push Notifications Runbook

## Required setup

- Apply migration `supabase/migrations/018_push_reminder_hardening.sql`.
- Set `EXPO_PUBLIC_EAS_PROJECT_ID` for the mobile build, or set `EAS_PROJECT_ID` during EAS builds.
- Configure push credentials in EAS for iOS/APNs and Android/FCM.
- Keep `REMINDER_MAX_PUSHES_PER_TOKEN_PER_DAY` unset for the default limit of `4`, or set a lower value for stricter anti-spam.

## Runtime behavior

- Mobile requests notification permission only on native platforms.
- Web skips push token registration until VAPID/web push is configured.
- Native registration sends Expo push token, platform, app version, device id, timezone, and timezone offset to `/reminders/push-token`.
- Logout deactivates the current push token via `DELETE /reminders/push-token`.
- Backend scheduler checks reminder times against each device local timezone.
- Backend writes `reminder_notification_log` before sending. This reserves the reminder and prevents duplicate sends if cron jobs overlap.
- A token can receive at most one push per meal per local day and at most `REMINDER_MAX_PUSHES_PER_TOKEN_PER_DAY` pushes per local day.

## Manual smoke

1. Build/install a native app with EAS credentials.
2. Log in on a physical device.
3. Confirm `/reminders/push-token` returns `{ "registered": true }`.
4. Use `/reminders/push-test` for a signed-in user to send a test nudge.
5. Confirm duplicate reminders for the same meal/local date are blocked by `reminder_notification_log`.

## Notes

- Expo push tokens are not Firebase registration tokens. Reminder push delivery uses the Expo Push API.
- The app still needs real EAS/APNs/FCM credentials before App Store or Play Store release.
