# Calorie AI

AI calorie and nutrition tracker with fast food logging, barcode lookup, activity sync, progress tracking, and coaching. The product direction is global-first, with strong Vietnamese food support rather than a Vietnam-only assumption.

## Tech Stack

| Layer | Tech |
| --- | --- |
| Mobile | React Native, Expo SDK 54, Expo Router |
| State | Zustand |
| Backend | NestJS, Passport JWT |
| Database | Supabase PostgreSQL, Auth, Storage |
| AI | Google Gemini via `@google/generative-ai` |
| Monorepo | Turborepo, npm workspaces |

## Project Structure

```text
calorie-ai-vn/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── backend/         # NestJS API
├── packages/
│   └── types/           # Shared TypeScript interfaces
├── supabase/
│   └── migrations/      # Database schema
├── docs/                # Build, QA, production, and delivery notes
└── k8s/
    └── prod/            # Production Kubernetes manifests
```

## Current Product Surface

The mobile app uses five primary tabs:

- Today: daily cockpit with calorie budget, macro snapshot, meals, streak, and quick actions.
- Scan: camera, gallery, text, receipt, barcode, food search, and voice-text parsing.
- Log: food logs, saved meals, activity logs, and daily exercise roadmap.
- Coach: coaching insights and chat-style guidance.
- Profile: profile, calorie targets, progress/insights/achievements entry points, reminders, subscription, and health sync settings.

Progress, Insights, and Achievements are secondary screens linked from Today/Profile, not primary tabs.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase project
- Gemini API key
- Expo/EAS account for native preview builds

### Install

```bash
npm install
```

### Environment

Create backend and mobile environment files from the repo examples, then fill in Supabase, JWT, API, and AI keys.

```bash
cp .env.example apps/backend/.env
cp .env.example apps/mobile/.env
```

### Database

Run Supabase migrations in order from `supabase/migrations/`. For reliable scan/search UX, seed both global staples and localized foods; barcode fallback uses Open Food Facts and caches normalized products locally.

### Start Dev Servers

```bash
npm run dev:backend:ready
npm run dev:mobile:web:ready
```

Windows helper:

```powershell
.\scripts\start-all.ps1
```

Restart and verify:

```powershell
.\scripts\restart-verify.ps1
.\scripts\restart-verify.ps1 -Build -RunTests
```

## Native Builds

Activity Sync uses native HealthKit on iOS and Health Connect on Android. It does not work in Expo Go.

```bash
cd apps/mobile
npm run build:android:preview
npm run build:ios:preview
```

Required EAS/GitHub secrets are documented in [docs/delivery/eas-secrets.md](docs/delivery/eas-secrets.md).

## Backend Docker

The backend Dockerfile depends on workspace packages, so build from the repository root:

```bash
docker build -f apps/backend/Dockerfile -t calorie-ai-backend:latest .
docker compose up --build
```

## Core API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/register` | Register |
| POST | `/auth/login` | Login |
| GET/PATCH | `/user/profile` | Profile |
| POST | `/calorie-target/calculate` | Calculate calorie target |
| GET | `/calorie-target/me` | Current calorie target |
| POST | `/ai/scan/image` | Image food scan |
| POST | `/ai/scan/text` | Text food parse |
| POST | `/ai/scan/voice` | Parse a user-provided voice transcript |
| POST | `/ai/scan/receipt` | Receipt scan |
| GET | `/food/search?q=...` | Food search |
| GET | `/food/barcode/:barcode` | Local barcode lookup with Open Food Facts fallback |
| GET | `/log/daily?date=YYYY-MM-DD` | Daily food log |
| POST | `/log` | Add food log |
| POST | `/log/activity` | Add activity log |

## Health And Nutrition Guardrails

- Calorie targets use Mifflin-St Jeor by default and Katch-McArdle only when body-fat percentage is realistic.
- BMI classification defaults to adult global cutoffs.
- Weight-loss targets are blocked for underweight users.
- Users under 18 receive maintenance estimates only.
- Targets include safety warnings and should not be treated as medical advice.

## Production Notes

- GitHub Actions builds and pushes the backend image from the repo root.
- Production deploy now requires a real `PRODUCTION_DEPLOY_WEBHOOK_URL`; the workflow fails if it is missing.
- Rollback requires `PRODUCTION_ROLLBACK_WEBHOOK_URL`.
- Kubernetes manifests currently exist under `k8s/prod`; there is no checked-in `k8s/staging` directory.

## Priority Backlog

- Validate and seed food data across global staples, packaged foods, and Vietnamese dishes.
- Add a real speech-to-text provider before presenting voice recording as automatic transcription.
- Expand nutrition goals beyond calories/macros: fiber, sodium, sugar, saturated fat, and key micronutrients.
- Add allergy/diet preference filters to recommendations.
- Run native QA on HealthKit, Health Connect, barcode, receipt, and EAS preview builds.
