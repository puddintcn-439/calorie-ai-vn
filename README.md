# Calorie AI VN 🥗

> AI Calorie Tracker cho đồ ăn Việt Nam — scan ảnh, nhập text, tự động phân tích calo.

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo SDK 51 + Expo Router |
| State | Zustand |
| Backend | NestJS + Passport JWT |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI | Google Gemini 2.0 Flash |
| Monorepo | Turborepo |

## Project Structure

```
calorie-ai-vn/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── backend/         # NestJS API
├── packages/
│   └── types/           # Shared TypeScript interfaces
└── supabase/
    └── migrations/      # Database schema
```

## Getting Started

### 1. Prerequisites

- Node.js >= 20
- npm >= 10
- [Supabase account](https://supabase.com) (free tier đủ dùng)
- [Google AI Studio API key](https://aistudio.google.com) (Gemini)

### 2. Clone & Install

```bash
git clone <repo>
cd calorie-ai-vn
npm install
```

### 3. Setup Environment

```bash
cp .env.example apps/backend/.env
# Điền Supabase URL, Service Key, Gemini API key, JWT secret

cp .env.example apps/mobile/.env
# Điền Supabase URL, Anon key, backend URL
```

### 4. Setup Supabase

1. Tạo project mới tại supabase.com
2. Vào SQL Editor, chạy lần lượt các file trong `supabase/migrations/`
3. Copy URL + keys vào `.env`

### 5. Run Development

```bash
# Backend
npm run backend
# → http://localhost:3000
# → Swagger: http://localhost:3000/api/docs

# Mobile (trong terminal khác)
npm run mobile
# → Quét QR bằng Expo Go app

### Run both dev (Windows) — helper script

There is a small PowerShell helper that starts the backend and mobile (Expo) dev servers in separate PowerShell windows and prints the reachable dev links (including `http://localhost:19006` when available).

Run it from repository root:

```powershell
.\scripts\start-all.ps1
```

The script will:
- free common dev ports (3000, 8081, 19006) if occupied
- open two PowerShell windows and run `npm run dev` in each
- wait briefly and print the reachable URLs (backend, Expo Metro, Expo web, and a best-effort dev-client URL)

File: [scripts/start-all.ps1](scripts/start-all.ps1)

### Restart + Verify agent (Windows)

If you want a single command to build (optional), restart dev servers, and run a quick verification check (after adding a function or fixing a bug), use the PowerShell agent:

```powershell
.\scripts\restart-verify.ps1    # defaults: build backend, restart backend+mobile, verify health
.\scripts\restart-verify.ps1 -NoOpenWindows    # show commands instead of opening windows
.\scripts\restart-verify.ps1 -Build -RunTests  # build + run backend tests before restart
.\scripts\restart-verify.ps1 -SkipVerify       # restart only, skip HTTP verification
```

What it does:
- Stops common dev ports (3000, 8081, 19006) if occupied
- Optionally builds `apps/backend` and runs a TS check for `apps/mobile`
- Starts `npm run dev` in `apps/backend` and `apps/mobile` (in new PowerShell windows)
- Waits for ports and performs a basic health check against `http://localhost:3000/health/ready`

File: [scripts/restart-verify.ps1](scripts/restart-verify.ps1)


```

### 6. Stable Dev Startup (Windows)

If you hit random startup failures due to occupied ports, use the preflight and ready scripts:

```bash
# Check env files and required ports
npm run preflight

# Check whether backend and Expo web are actually healthy
npm run health

# Clean dev ports (3000, 19006, 19007)
npm run dev:ports:clean

# Start backend in watch mode (recommended for active development)
npm run dev:backend:ready

# Start Expo web in non-interactive mode on 19006
npm run dev:mobile:web:ready
```

### 7. Activity Sync Native QA

Activity Sync now uses native HealthKit on iOS and Health Connect on Android. It is not available in Expo Go.

Prerequisites:

- Android: install Google Health Connect and grant steps, distance, and calories permissions
- iPhone: Apple Health must be available and the app must be granted read access for steps, distance, and active energy
- Use a dev build or internal preview build, not Expo Go

Build commands:

```bash
# Android internal preview build
cd apps/mobile
npm run build:android:preview

# iOS internal preview build
cd apps/mobile
npm run build:ios:preview
```

Phone test entry:

```text
calorieai://health-sync
```

The Health Sync diagnostics screen lets you:

- verify provider readiness
- inspect granted vs missing permissions
- inspect today's synced steps / distance / calories snapshot
- manually trigger activity sync for a chosen date

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Đăng ký |
| POST | `/auth/login` | Đăng nhập |
| POST | `/ai/scan/image` | Scan ảnh đồ ăn |
| POST | `/ai/scan/text` | Phân tích text |
| POST | `/ai/coach` | Hỏi AI coach |
| GET | `/log/daily?date=YYYY-MM-DD` | Log hôm nay |
| POST | `/log` | Thêm log |
| DELETE | `/log/:id` | Xoá log |
| GET | `/food/search?q=phở` | Tìm kiếm món ăn |
| GET | `/user/profile` | Xem profile |
| PATCH | `/user/profile` | Cập nhật profile |

## Roadmap

- [ ] Streak / gamification
- [ ] AI Coach màn hình chat
- [ ] Weekly insights
- [ ] Barcode scanner
- [ ] Apple HealthKit / Google Fit sync
- [ ] Freemium / subscription (RevenueCat)
