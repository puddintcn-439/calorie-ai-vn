# Load Tests

k6-based load test covering health, auth, food logging, and AI text scan scenarios.

## Setup

```bash
# Install k6 (Windows)
winget install k6 --source winget

# Install k6 (macOS)
brew install k6

# Or download: https://k6.io/docs/getting-started/installation/
```

## Test users

Create two dedicated test accounts in Supabase before running:

| Variable | Purpose |
|---|---|
| `TEST_EMAIL` / `TEST_PASSWORD` | Auth + logging scenarios |
| `AI_TEST_EMAIL` / `AI_TEST_PASSWORD` | AI scan scenario (separate to isolate daily quota) |

## Chạy

```bash
# Local dev
k6 run \
  --env BASE_URL=http://localhost:3000 \
  --env TEST_EMAIL=k6_loadtest@test.internal \
  --env TEST_PASSWORD=K6LoadTest123! \
  --env AI_TEST_EMAIL=k6_ai_test@test.internal \
  --env AI_TEST_PASSWORD=K6LoadTest123! \
  load-tests/k6-load-test.js

# Staging
k6 run \
  --env BASE_URL=https://your-staging-api.com \
  --env TEST_EMAIL=loadtest@yourdomain.com \
  --env TEST_PASSWORD=SecurePass! \
  --env AI_TEST_EMAIL=ai_loadtest@yourdomain.com \
  --env AI_TEST_PASSWORD=SecurePass! \
  load-tests/k6-load-test.js
```

## Scenarios

| Scenario | VUs | Duration | Mục đích |
|---|---|---|---|
| `health-probe` | 1 | 3m | Uptime check xuyên suốt |
| `auth-flow` | 5 | 2m30s | Profile fetch throughput (token từ setup) |
| `logging-flow` | 10 | 2m30s | GET daily logs + POST food log |
| `ai-text-scan` | 2 | 2m | Gemini text scan (quota-aware) |

## Thresholds

| Metric | Target | Ghi chú |
|---|---|---|
| `error_rate` | < 1% | Lỗi thực sự của API |
| Health p95 | < 500ms | Bao gồm round-trip tới Supabase |
| Profile p95 | < 1000ms | |
| Log POST p95 | < 800ms | Custom metric `log_post_duration_ms` |
| AI scan p95 | < 8000ms | Gemini cold start + generation |

## Gemini rate limits

- **Free tier**: 15 RPM, 1500 RPD — script dùng 2 VUs + sleep 8–12s để giữ dưới ~10 RPM
- **Paid tier**: 1000 RPM — có thể tăng lên 10+ VUs
- `ai_quota_blocked` counter tăng khi gặp 429 nhưng **không** tính vào `error_rate`

## Kết quả

Mỗi lần chạy ghi ra `load-tests/results/summary.json` (gitignored — runtime output).

## Trước khi test staging/production

1. Chạy `supabase/schema_audit.sql` để verify schema
2. Backup database
3. Dùng account test riêng, không dùng account thật
4. Monitor `/health` trong khi test
