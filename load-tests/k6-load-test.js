/**
 * Calorie AI — k6 Load Test
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Run (local dev):
 *   k6 run \
 *     --env BASE_URL=http://localhost:3000 \
 *     --env TEST_EMAIL=k6_loadtest@test.internal \
 *     --env TEST_PASSWORD=K6LoadTest123! \
 *     --env AI_TEST_EMAIL=k6_ai_test@test.internal \
 *     --env AI_TEST_PASSWORD=K6LoadTest123! \
 *     load-tests/k6-load-test.js
 *
 * Run (staging):
 *   k6 run \
 *     --env BASE_URL=https://your-api.com \
 *     --env TEST_EMAIL=loadtest@yourdomain.com \
 *     --env TEST_PASSWORD=SecurePass! \
 *     --env AI_TEST_EMAIL=ai_loadtest@yourdomain.com \
 *     --env AI_TEST_PASSWORD=SecurePass! \
 *     load-tests/k6-load-test.js
 *
 * Design notes:
 *   - setup() logs in ONCE per test run, returns tokens to all VUs.
 *     This avoids flooding the auth rate-limiter (60 req/min per IP)
 *     and makes login latency a one-time cost, not per-iteration.
 *   - Two separate test users: main user for auth/logging, ai_user for
 *     AI scans. Keeps AI daily quota from polluting across test runs.
 *   - AI quota blocked (429) is handled gracefully — not counted as error.
 *
 * Gemini rate limits:
 *   Free tier:  15 RPM, 1500 RPD — use max 2 VUs for ai-text-scan
 *   Paid tier:  1000 RPM — can raise to 10+ VUs safely
 *
 * Reading results:
 *   error_rate > 1%              → real API errors, check backend logs
 *   ai_quota_blocked > 0         → expected if ai_user hit daily limit
 *   log_post_duration_ms p95     → core write path latency
 *   http_req_duration{health} p95 > 500ms → DB connection degraded
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── Custom metrics ────────────────────────────────────────────────────────────
const aiQuotaBlocked  = new Counter('ai_quota_blocked');
const aiSuccess       = new Counter('ai_scan_success');
const aiFailed        = new Counter('ai_scan_failed');
const logPostDuration = new Trend('log_post_duration_ms');
const aiScanDuration  = new Trend('ai_scan_duration_ms');
const errorRate       = new Rate('error_rate');

// ─── Configuration ─────────────────────────────────────────────────────────────
const BASE_URL         = __ENV.BASE_URL         || 'http://localhost:3000';
const TEST_EMAIL       = __ENV.TEST_EMAIL       || 'loadtest@example.com';
const TEST_PASSWORD    = __ENV.TEST_PASSWORD    || 'LoadTest123!';
const AI_TEST_EMAIL    = __ENV.AI_TEST_EMAIL    || TEST_EMAIL;
const AI_TEST_PASSWORD = __ENV.AI_TEST_PASSWORD || TEST_PASSWORD;

// ─── Scenarios ─────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    'health-probe': {
      executor: 'constant-vus',
      vus: 1,
      duration: '3m',
      exec: 'healthProbe',
      tags: { scenario: 'health-probe' },
    },
    'auth-flow': {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '90s', target: 5 },
        { duration: '30s', target: 0 },
      ],
      exec: 'authFlow',
      tags: { scenario: 'auth-flow' },
    },
    'logging-flow': {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '90s', target: 10 },
        { duration: '30s', target: 0  },
      ],
      exec: 'loggingFlow',
      startTime: '15s',
      tags: { scenario: 'logging-flow' },
    },
    'ai-text-scan': {
      executor: 'constant-vus',
      vus: 2,
      duration: '2m',
      exec: 'aiTextScan',
      startTime: '30s',
      tags: { scenario: 'ai-text-scan' },
    },
  },

  thresholds: {
    error_rate: ['rate<0.01'],
    // Health hits remote Supabase DB — 500ms is realistic baseline
    'http_req_duration{scenario:health-probe}': ['p(95)<500'],
    'http_req_duration{scenario:auth-flow}':    ['p(95)<1000'],
    'http_req_duration{scenario:logging-flow}': ['p(95)<800'],
    'http_req_duration{scenario:ai-text-scan}': ['p(95)<8000'],
    log_post_duration_ms: ['p(95)<800'],
    ai_scan_duration_ms:  ['p(95)<8000'],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

function loginOnce(email, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS, tags: { endpoint: 'setup-login' } },
  );
  if (res.status !== 200) {
    throw new Error(`setup login failed: ${res.status} ${res.body}`);
  }
  return JSON.parse(res.body).access_token;
}

// ─── Setup: login once before VUs start ───────────────────────────────────────
export function setup() {
  const mainToken = loginOnce(TEST_EMAIL, TEST_PASSWORD);
  const aiToken   = loginOnce(AI_TEST_EMAIL, AI_TEST_PASSWORD);
  return { mainToken, aiToken };
}

// ─── Scenario: health probe ────────────────────────────────────────────────────
export function healthProbe() {
  group('health-probe', () => {
    const res = http.get(`${BASE_URL}/health`, {
      headers: { Accept: 'application/json' },
      tags: { endpoint: 'health' },
    });
    const ok = check(res, {
      'health: status 200':   (r) => r.status === 200,
      'health: db connected': (r) => {
        try { return JSON.parse(r.body).database?.status === 'connected'; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });
  sleep(5);
}

// ─── Scenario: auth flow ───────────────────────────────────────────────────────
export function authFlow(data) {
  group('auth-flow', () => {
    const res = http.get(`${BASE_URL}/user/profile`, {
      headers: authHeaders(data.mainToken),
      tags: { endpoint: 'user-profile' },
    });
    const ok = check(res, {
      'profile: status 200': (r) => r.status === 200,
      'profile: has id':     (r) => {
        try { return !!JSON.parse(r.body).id; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });
  sleep(2 + Math.random() * 2);
}

// ─── Scenario: logging flow ────────────────────────────────────────────────────
export function loggingFlow(data) {
  group('logging-flow', () => {
    const today = new Date().toISOString().split('T')[0];

    const listRes = http.get(
      `${BASE_URL}/log/daily?date=${today}`,
      { headers: authHeaders(data.mainToken), tags: { endpoint: 'log-list' } },
    );
    const listOk = check(listRes, {
      'log list: status 200': (r) => r.status === 200,
    });
    errorRate.add(!listOk);

    sleep(0.5);

    const start = Date.now();
    const logRes = http.post(
      `${BASE_URL}/log`,
      JSON.stringify({
        name:            `Load Test Food VU${__VU}`,
        meal_type:       ['breakfast', 'lunch', 'dinner', 'snack'][__ITER % 4],
        calories:        300 + Math.floor(Math.random() * 250),
        protein_g:       12 + Math.random() * 15,
        carbs_g:         35 + Math.random() * 25,
        fat_g:           6  + Math.random() * 8,
        estimated_grams: 200 + Math.floor(Math.random() * 100),
      }),
      { headers: authHeaders(data.mainToken), tags: { endpoint: 'log-create' } },
    );
    logPostDuration.add(Date.now() - start);

    const logOk = check(logRes, {
      'log create: status 201': (r) => r.status === 201,
      'log create: has id':     (r) => {
        try { return !!JSON.parse(r.body).id; } catch { return false; }
      },
    });
    errorRate.add(!logOk);
  });
  sleep(1 + Math.random() * 2);
}

// ─── Scenario: AI text scan ────────────────────────────────────────────────────
// Uses a dedicated AI test user to isolate daily quota from the logging user.
// Sleep 8–12s between calls keeps 2 VUs under 15 RPM (Gemini free tier limit).
export function aiTextScan(data) {
  group('ai-text-scan', () => {
    const inputs = [
      'Tôi ăn 1 tô phở bò và 1 ly cà phê sữa đá buổi sáng',
      'Lunch: grilled chicken 150g, brown rice 200g, salad',
      'Cơm tấm sườn bì chả 1 dĩa, uống nước lọc',
      'Snack: 1 banana and 2 tablespoons peanut butter',
      'Bún bò Huế 1 tô lớn, thêm rau sống và giá',
    ];
    const text = inputs[__ITER % inputs.length];

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/ai/scan/text`,
      JSON.stringify({ text }),
      { headers: authHeaders(data.aiToken), tags: { endpoint: 'ai-text-scan' }, timeout: '15s' },
    );
    aiScanDuration.add(Date.now() - start);

    // 429 = quota exceeded — expected, not an error
    if (res.status === 429) {
      aiQuotaBlocked.add(1);
      sleep(15);
      return;
    }

    const ok = check(res, {
      'ai scan: status 200':          (r) => r.status === 200,
      'ai scan: has items array':     (r) => {
        try { return Array.isArray(JSON.parse(r.body).items); } catch { return false; }
      },
      'ai scan: items have calories': (r) => {
        try {
          const items = JSON.parse(r.body).items;
          return items.length > 0 && typeof items[0].calories === 'number';
        } catch { return false; }
      },
    });

    if (ok) { aiSuccess.add(1); } else { aiFailed.add(1); errorRate.add(1); }
  });
  sleep(8 + Math.random() * 4);
}

// ─── Summary ───────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const m = data.metrics;
  const v = (name, key) => { try { return m[name].values[key]; } catch { return null; } };

  const failed = Object.entries(m)
    .filter(([, metric]) => metric.thresholds &&
      Object.values(metric.thresholds).some((t) => !t.ok))
    .map(([name]) => name);

  console.log('\n=== Calorie AI Load Test Summary ===');
  console.log(`Error rate:        ${((v('error_rate', 'rate') || 0) * 100).toFixed(2)}%`);
  console.log(`Health p95:        ${(v('http_req_duration{scenario:health-probe}', 'p(95)') || 0).toFixed(0)} ms`);
  console.log(`Profile p95:       ${(v('http_req_duration{scenario:auth-flow}', 'p(95)') || 0).toFixed(0)} ms`);
  console.log(`Log POST p95:      ${(v('log_post_duration_ms', 'p(95)') || 0).toFixed(0)} ms`);
  console.log(`AI scan p95:       ${(v('ai_scan_duration_ms', 'p(95)') || 0).toFixed(0)} ms`);
  console.log(`AI success:        ${v('ai_scan_success', 'count') || 0}`);
  console.log(`AI failed:         ${v('ai_scan_failed', 'count') || 0}`);
  console.log(`AI quota blocked:  ${v('ai_quota_blocked', 'count') || 0}`);
  console.log(`Total requests:    ${v('http_reqs', 'count') || 0}`);
  console.log(`Throughput:        ${(v('http_reqs', 'rate') || 0).toFixed(1)} req/s`);

  if (failed.length > 0) {
    console.log(`\nFAILED THRESHOLDS:\n  ${failed.join('\n  ')}`);
  } else {
    console.log('\nAll thresholds PASSED.');
  }
  console.log('=====================================\n');

  return { 'load-tests/results/summary.json': JSON.stringify(data, null, 2), stdout: '' };
}
