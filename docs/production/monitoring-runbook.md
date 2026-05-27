# Monitoring & Observability Runbook

> **Scope**: Calorie AI VN backend — production operations reference

---

## 1. Metrics Endpoint

The backend exposes a structured metrics snapshot at:

```
GET /health/metrics
```

No authentication required (internal-network read only — restrict in reverse proxy if needed).

### Response shape

```json
{
  "counters": {
    "auth_login_success": 120,
    "auth_login_failure": 8,
    "auth_register_success": 14,
    "auth_register_failure": 1,
    "ai_scan_success": 95,
    "ai_scan_failure": 5,
    "activity_sync_success": 40,
    "activity_sync_failure": 2,
    "http_requests_total": 540,
    "http_errors_5xx": 3,
    "http_errors_4xx": 22
  },
  "rates": {
    "auth_failure_rate_pct": 6.9,
    "ai_scan_success_rate_pct": 95.0
  },
  "alerts": [
    {
      "name": "high_auth_failure_rate",
      "fired": false,
      "value": 6.9,
      "threshold": 25,
      "unit": "%",
      "description": "Authentication failure rate exceeds threshold"
    },
    {
      "name": "low_ai_scan_success_rate",
      "fired": false,
      "value": 95.0,
      "threshold": 70,
      "unit": "%",
      "description": "AI food scan success rate is below acceptable threshold"
    },
    {
      "name": "high_5xx_error_count",
      "fired": false,
      "value": 3,
      "threshold": 50,
      "unit": "count",
      "description": "Accumulated 5xx server errors exceed threshold since process start"
    }
  ],
  "process": { "uptime_s": 3600, "memory_heap_mb": 128 },
  "window_start": "2026-05-09T12:00:00.000Z",
  "snapshot_at": "2026-05-09T13:00:00.000Z"
}
```

Counters reset when the process restarts. The `window_start` field records when the current process started.

---

## 2. Alert Thresholds & SLOs

| Metric | Green | Yellow | Red (Alert) | Owner |
|--------|-------|--------|-------------|-------|
| Auth failure rate | < 15% | 15–25% | **> 25%** | Backend |
| AI scan success rate | > 85% | 70–85% | **< 70%** | AI / Backend |
| 5xx error count (since restart) | < 20 | 20–50 | **> 50** | Backend |
| DB latency (`/health` `latency_ms`) | < 300ms | 300–1000ms | **> 1000ms** | Infra |
| Activity sync failure rate | < 10% | 10–25% | **> 25%** | Mobile / Backend |

### Database Latency

Poll `/health` every minute. Alert if `database.latency_ms > 1000`.

### Uptime SLO Target

- **99.5%** monthly (≤ 3.6 hours downtime/month)
- Health probe: `GET /health/live` — returns 200 when the process is alive
- Readiness probe: `GET /health/ready` — returns 200 when DB is reachable

---

## 3. Polling / Alert Routing

### Option A: Uptime Robot / BetterStack (free tier suitable)

1. Create HTTP monitor → `https://api.calorieai.vn/health`
2. Alert if response is not 200 OR `status !== "healthy"` for 2+ consecutive checks
3. Alert channel: Telegram / email

### Option B: Built-in polling script (cron / GitHub Actions)

The repo includes `scripts/check-production-metrics.js`, which polls `/health/metrics`,
checks `alerts[].fired`, and exits with:

- `0`: no alert fired
- `1`: metrics endpoint or notification failure
- `2`: at least one production alert fired

Generic webhook:

```bash
METRICS_URL=https://api.calorieai.vn/health/metrics \
ALERT_WEBHOOK_URL=https://hooks.example.com/calorie-ai-alerts \
npm run monitor:metrics
```

Telegram:

```bash
METRICS_URL=https://api.calorieai.vn/health/metrics \
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_CHAT_ID=... \
npm run monitor:metrics
```

Recommended cron cadence: every 1 minute. Configure the scheduler to notify on
non-zero exit, and keep the webhook credentials in the scheduler secret store.

GitHub Actions path:

- Workflow: `.github/workflows/production-metrics-monitor.yml`
- Schedule: every 5 minutes
- Required variable: `PRODUCTION_METRICS_URL=https://api.calorieai.vn/health/metrics`
- Optional alert secrets: `PRODUCTION_ALERT_WEBHOOK_URL`, or `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- If no alert secret is configured, a fired metric still fails the workflow so GitHub can notify maintainers.

Legacy shell equivalent:

```bash
#!/bin/bash
METRICS=$(curl -sf https://api.calorieai.vn/health/metrics)
AUTH_FAIL=$(echo $METRICS | jq '.alerts[] | select(.name=="high_auth_failure_rate") | .fired')
AI_LOW=$(echo $METRICS | jq '.alerts[] | select(.name=="low_ai_scan_success_rate") | .fired')

if [ "$AUTH_FAIL" = "true" ] || [ "$AI_LOW" = "true" ]; then
  # send Telegram/Slack alert
  curl -sX POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "text=🚨 ALERT: Calorie AI production metrics out of threshold"
fi
```

### Option C: Supabase Dashboard

Supabase provides built-in query analytics. Enable under Project Settings → Reports.

---

## 4. Incident Response

### Runbook: High Auth Failure Rate

1. Check recent logs: `tail -f logs/requests-<date>.jsonl | grep '"status":401'`
2. Look for brute-force pattern: many failures from same IP → check rate limiting (60 req/min per IP via ThrottlerModule)
3. If credential stuffing: rotate JWT secret → invalidates all existing tokens
4. Alert resolved when `auth_failure_rate_pct < 15%` for 5 consecutive polls

### Runbook: Low AI Scan Success Rate

1. Check `logs/` for `[500] POST /ai/` entries
2. Verify Gemini API key: `curl https://generativelanguage.googleapis.com/v1/models -H "X-goog-api-key: $GEMINI_API_KEY"`
3. If Gemini is down: rate limit scan endpoint or return `503 Service Unavailable`
4. Alert resolved when `ai_scan_success_rate_pct > 80%` for 5 polls

### Runbook: High 5xx Rate

1. `grep '"status":5' logs/requests-<date>.jsonl | jq '.path' | sort | uniq -c | sort -rn`
2. Identify which route is failing
3. Check Supabase connection pool — DB latency spike often causes cascading 5xx
4. Restart pod/container if memory heap > 512MB: `GET /health/metrics` → `process.memory_heap_mb`

### Runbook: DB Latency Spike

1. Check Supabase dashboard → Database → Connections
2. Look for long-running queries in Supabase → SQL Editor → `pg_stat_activity`
3. If connection pool exhausted: reduce `SUPABASE_MAX_CONNECTIONS` env and restart
4. If sustained > 2000ms: consider read replica or query optimization

---

## 5. Log Format

Request logs are written to `./logs/requests-YYYY-MM-DD.jsonl` (JSON Lines format):

```json
{"timestamp":"2026-05-09T12:00:01.000Z","method":"POST","path":"/ai/scan","status":200,"duration_ms":1243,"user_id":"uid-abc"}
{"timestamp":"2026-05-09T12:00:02.000Z","method":"POST","path":"/auth/login","status":401,"duration_ms":45,"user_id":null}
```

Parse with `jq`:
- Error rates: `jq 'select(.status >= 400)' requests-*.jsonl | wc -l`
- Slow requests: `jq 'select(.duration_ms > 2000)' requests-*.jsonl`
- Per-user activity: `jq --arg uid "uid-abc" 'select(.user_id == $uid)' requests-*.jsonl`

---

## 6. Container Health Probes (Dockerfile)

```
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', r => process.exit(r.statusCode===200?0:1))"
```

- **Liveness**: `/health/live` — restarts container if it hangs  
- **Readiness**: `/health/ready` — removes from load balancer if DB is unreachable  
- **Health (full)**: `/health` — reports latency for alerting  

---

*Last updated: 2026-05-09 | Version: 1.0*
