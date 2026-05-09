# Incident Runbook v1

## Purpose
Standard operating procedures for common production incidents in Calorie AI VN platform.

---

## Incident Categories

### 1. Health Check Failures

**Symptoms:**
- `GET /health` returns status: "unhealthy"
- `GET /health/ready` returns ready: false
- Database latency_ms > 5000ms

**Root Cause Analysis:**
- [ ] Check database connectivity: `SUPABASE_URL` and `SUPABASE_KEY` env vars set?
- [ ] Verify PostgreSQL is accepting connections: `psql -h <host> -U <user> -d calorie_ai -c "SELECT 1"`
- [ ] Check network policies: Is backend blocked from database by firewall/VPC rules?
- [ ] Check RLS policies: Are they causing query timeout?

**Resolution Steps:**
1. Check backend logs: `tail -f logs/requests-*.jsonl | jq 'select(.status >= 500)'`
2. Verify DB connection pool: Check `SELECT count(*) FROM pg_stat_activity` on DB
3. Restart backend service if DB recovers: `npm run dev:backend:ready`
4. If persisting, scale down other services to reduce connection load

**Prevention:**
- [ ] Set database connection timeout to 5s (config: `SUPABASE_TIMEOUT=5000`)
- [ ] Monitor `pg_stat_activity` count in continuous integration
- [ ] Add alerting threshold: if health check failures > 3 in 1min, page on-call

---

### 2. Authentication Token Expiration

**Symptoms:**
- Mobile app returns 401 Unauthorized on protected endpoints
- User logs are present but requests fail
- Error in logs: "Token expired" or "Invalid JWT"

**Root Cause Analysis:**
- [ ] Check JWT_SECRET in env vars: Is it rotated unexpectedly?
- [ ] Verify token expiry: `echo $JWT_EXPIRY` (should be > 7 days for mobile app)
- [ ] Check NTP sync on backend: `timedatectl` (clock skew causes token rejection)
- [ ] Verify Supabase auth config: Are token revocation policies active?

**Resolution Steps:**
1. Check backend logs for auth errors: `grep -i "token\|jwt" logs/requests-*.jsonl`
2. Restart backend to clear any token cache: `npm run dev:backend:ready`
3. Invalidate client tokens: Push notification to mobile app to re-authenticate
4. Verify all servers have correct JWT_SECRET: `echo $JWT_SECRET | sha256sum` on each node

**Prevention:**
- [ ] Document JWT rotation schedule (recommend monthly)
- [ ] Set JWT_EXPIRY to 30 days for mobile (configure in .env)
- [ ] Enable token refresh endpoint: `POST /auth/refresh` for long-lived clients
- [ ] Add NTP monitoring: alert if clock skew > 30 seconds

---

### 3. Calorie Target Calculation Failures

**Symptoms:**
- `POST /calorie-target/calculate` returns 400 Bad Request
- Mobile app shows "Unable to calculate daily target"
- Backend logs: "Profile incomplete" or "Invalid profile data"

**Root Cause Analysis:**
- [ ] Check user profile: All required fields present? `SELECT * FROM user_profiles WHERE user_id = '<id>' \G`
- [ ] Validate data types: weight_kg number, age > 0, height_cm > 100?
- [ ] Verify profile fetch: Is UserService.getProfile() returning stale data?
- [ ] Check RLS policies: Are they filtering out user's own profile?

**Resolution Steps:**
1. Check request body validation: Is request missing required fields?
2. Fetch user profile directly: `curl GET /user/profile -H "Authorization: Bearer $TOKEN"`
3. If profile exists but endpoint fails, check CalorieTargetService logs
4. If profile missing, prompt user to complete onboarding
5. Reset user profile: `PUT /user/profile` with correct values

**Prevention:**
- [ ] Add pre-flight validation: `GET /user/profile` before calling calculate
- [ ] Mobile app should cache profile locally and sync on each login
- [ ] Add monitoring: alert if calculate endpoint error_rate > 5%
- [ ] Document required profile fields in mobile UI

---

### 4. Weekly Adjustment Not Triggering

**Symptoms:**
- `POST /calorie-target/weekly-adjustment` returns 200 but adjustment_percentage is 0%
- User's daily target unchanged after a week
- Backend logs show: "No logs found for last 7 days"

**Root Cause Analysis:**
- [ ] Check if user has logged any food: `SELECT COUNT(*) FROM logs WHERE user_id = '<id>' AND created_at > now() - interval '7 days'`
- [ ] Verify log table timezone: Are logs recorded in UTC?
- [ ] Check WeeklyAdaptiveService query: Is it filtering by correct date range?
- [ ] Verify adherence calculation: Is it comparing against correct daily_target?

**Resolution Steps:**
1. Manually check logs: `curl GET /log -H "Authorization: Bearer $TOKEN"`
2. If no logs exist, create test log entries: `curl POST /log -d '{"food_name":"Test","calories":500}'`
3. Re-run adjustment: `curl POST /calorie-target/weekly-adjustment`
4. If still 0%, check CalorieTargetService logs for calculation errors

**Prevention:**
- [ ] Add reminder system to prompt user to log food daily (already implemented)
- [ ] Mobile app should show "No logs this week" warning
- [ ] Set minimum data requirement: need at least 3 days of logs to adjust
- [ ] Add observability: track weekly_adjustment call frequency and adjustment_percentage distribution

---

### 5. Food Recommendation Mismatch

**Symptoms:**
- Recommended foods have incorrect calorie amounts
- Meal recommendations don't sum to daily_calorie_target
- Mobile UI shows 0 recommended foods

**Root Cause Analysis:**
- [ ] Check food database freshness: Are food records stale? `SELECT COUNT(*) FROM foods WHERE updated_at < now() - interval '30 days'`
- [ ] Verify food query: Is RecommendationService using correct calorie range?
- [ ] Check remaining_calories calculation: Is it correctly subtracting logged calories?
- [ ] Verify query limit: Are we fetching enough food options?

**Resolution Steps:**
1. Check today's logs: `SELECT SUM(calories) as total FROM logs WHERE user_id = '<id>' AND created_at > today()`
2. Fetch recommendations: `curl GET /calorie-target/recommendations/me -H "Authorization: Bearer $TOKEN"`
3. Verify remaining_calories = daily_target - today_total_calories
4. If recommendations empty, check if food database has records: `SELECT COUNT(*) FROM foods`

**Prevention:**
- [ ] Set up food database sync job: refresh every 24 hours from external source
- [ ] Add monitoring: alert if recommended foods per meal < 3
- [ ] Document food data quality threshold: confidence > 0.9
- [ ] Mobile UI should show "No matching foods" gracefully if empty

---

## General Incident Response

### Quick Assessment Checklist
- [ ] Is backend service running? `curl http://localhost:3000/health`
- [ ] Is database connected? `curl http://localhost:3000/health | jq .database.status`
- [ ] Are there recent errors? `tail -100 logs/requests-*.jsonl | jq 'select(.status >= 400)'`
- [ ] Is mobile app making requests? Check app logs: `xcrun simctl spawn booted log stream --predicate 'eventMessage contains "calorie-api"'`

### Escalation Path
1. **Severity 1 (System Down):** Declare SEV-1, page on-call engineer immediately
2. **Severity 2 (Major Feature Down):** Page on-call within 5min, create incident ticket
3. **Severity 3 (Minor Bug):** Create issue for triage, no immediate page

### Communication
- [ ] Post in #incidents Slack channel with status updates every 5min
- [ ] Include: incident title, severity, affected users, root cause (if known), ETA
- [ ] Post post-mortem within 24 hours: root cause, timeline, action items

### Documentation
- [ ] Update this runbook after resolving new incident types
- [ ] Add monitoring/alerting for prevention
- [ ] Link resolved issue to incident response page for knowledge sharing
