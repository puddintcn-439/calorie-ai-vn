# App Flow By Tab

This document describes the current mobile app flow. The product is global-first with localized food and language support, including strong Vietnamese coverage.

## Primary Tabs

### Today

Daily cockpit for the current day.

- Shows calorie target, food calories, activity calories, net calories, macro progress, meals today, streak, and coaching snippets.
- Shows daily fiber, sodium, total sugar, and saturated fat totals when logged food data includes those nutrients.
- Shows a profile-safety prompt when age, body metrics, or health flags are missing, and a short medical-review reminder for risk flags.
- Offers quick goal-plan presets that save through backend safety clamps instead of directly overriding calories.
- Recommends one movement action based on today's net calories, goal plan, health flags, and the user's Profile activity preferences.
- Completing the Today movement recommendation writes an activity log, so burned calories and Log history stay consistent.
- Pull-to-refresh reloads daily log, activity logs, recommendations, gamification, subscription, and top insight.
- Links to Progress, Insights, Achievements, Scan, Log, Coach, and Health Sync diagnostics.
- Should stay action-focused: scan, log, review meals, and see one clear next step.

### Scan

Fast intake surface for food logging.

- Modes: camera, gallery, text, receipt, barcode, food search, and voice transcript.
- Voice mode currently parses typed or pasted transcripts. Recording is allowed as a draft aid, but the app does not claim automatic speech-to-text until a real provider is integrated.
- Barcode lookup checks local foods first, then Open Food Facts, normalizes serving size, and caches fallback products locally.
- Scan results show confidence and allow correction before saving.

### Log

Daily journal for food and activity.

- Shows meal-grouped food logs, saved meals, activity logs, and quick activity creation.
- Food logs affect daily intake; activity logs affect net calories in Today.
- The add-activity flow can log manually, open Strength, or complete a Profile activity preference through "Theo lộ trình".
- Log does not manage the activity roadmap; Profile is the source of truth for the user's preferred activities.

### Coach

Behavioral and nutrition coaching surface.

- Shows insights, weekly summary, and AI coach responses.
- Uses food/activity/progress context where available.
- Must keep health copy non-clinical and avoid diagnosis or treatment claims.

### Profile

Settings and personalization hub.

- Profile fields: name, weight, height, age, gender, health flags, goal, goal plan, activity level, meal calorie targets, reminders, subscription, and feature access.
- BMI and calorie guidance defaults to adult global cutoffs and is labeled as screening/risk, not diagnosis.
- Under-18 users, pregnancy/breastfeeding profiles, and eating-disorder risk profiles receive maintenance-only targets.
- Kidney disease, diabetes, and weight-affecting medication flags trigger medical-review warnings and non-personalized macro caveats.
- Macro output includes general quality targets for fiber, sodium, free/added sugar, and saturated fat.
- Activity preferences can be added, edited, and deleted here; Today uses them for movement recommendations and Log uses them for quick completion.
- Progress, Insights, and Achievements are linked from here as secondary screens.
- Goal plans show the computed calorie target, weekly rate, safety status, and any backend adjustment warning.

## Secondary Screens

- Progress: body metrics, body-fat entry, trend history, and weight changes.
- Insights: weekly calorie, adherence, and macro summaries.
- Achievements: streak and milestone feedback.
- Health Sync diagnostics: HealthKit and Health Connect readiness, permissions, and sync snapshot.
- Strength: strength session entry and activity logging.

## Data Flow

- `useLogStore` owns daily food logs, saved meals, activity logs, daily roadmap compatibility actions, and persistent activity preferences.
- `useCalorieTargetStore` owns recommendations and weekly adaptive target preview/apply.
- `useSubscriptionStore` owns feature gating.
- `useGamificationStore` owns streak and achievement summary.
- `activitySyncService` reads native health data in development or preview builds, not Expo Go.
- `ai.service` handles image/text/receipt/voice-transcript scan flows.

## Release-Critical Checks

- Today loads without empty critical cards after profile is complete.
- Scan result can be corrected and saved to Log.
- Barcode serving calories are scaled by serving size, not blindly saved as per-100g.
- Text/voice transcript parsing does not use fake placeholder transcripts.
- Profile warns that calorie/BMI outputs are estimates and not medical advice.
- Under-18 and underweight weight-loss flows are blocked to maintenance.
- Profile activity preferences appear in Today recommendations and completed Today activities appear in Log.
- Health Sync is tested on real iOS/Android preview builds.
- Food search returns global staples and localized dishes.
