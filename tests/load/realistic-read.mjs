const BASE = process.env.TARGET_URL || 'http://localhost:3000';
const TOKEN = process.env.API_TOKEN;
const TZ_OFFSET_MINUTES = process.env.TZ_OFFSET_MINUTES || '420';

const profile = process.env.LOAD_TEST_PROFILE || 'realistic';
const stages = profile === 'gentle'
  ? [
      { durationMs: 30_000, target: 4 },
      { durationMs: 60_000, target: 8 },
      { durationMs: 60_000, target: 8 },
      { durationMs: 30_000, target: 0 },
    ]
  : profile === 'short'
  ? [
      { durationMs: 30_000, target: 8 },
      { durationMs: 60_000, target: 15 },
      { durationMs: 90_000, target: 20 },
      { durationMs: 60_000, target: 10 },
      { durationMs: 30_000, target: 0 },
    ]
  : [
  { durationMs: 60_000, target: 10 },
  { durationMs: 120_000, target: 25 },
  { durationMs: 120_000, target: 40 },
  { durationMs: 120_000, target: 25 },
  { durationMs: 60_000, target: 0 },
];
let summaryPrinted = false;
let runStartedAt = Date.now();

const metrics = {
  total: 0,
  failed: 0,
  serverErrors: 0,
  authErrors: 0,
  durations: [],
  statuses: new Map(),
  endpoints: new Map(),
};

function record(endpoint, status, durationMs, error) {
  metrics.total += 1;
  metrics.durations.push(durationMs);
  metrics.statuses.set(status, (metrics.statuses.get(status) || 0) + 1);

  const endpointMetrics =
    metrics.endpoints.get(endpoint) ||
    { total: 0, failed: 0, serverErrors: 0, durations: [] };
  endpointMetrics.total += 1;
  endpointMetrics.durations.push(durationMs);

  const failed = Boolean(error) || status < 200 || status >= 300;
  if (failed) {
    metrics.failed += 1;
    endpointMetrics.failed += 1;
  }

  if (status >= 500 || error) {
    metrics.serverErrors += 1;
    endpointMetrics.serverErrors += 1;
  }

  if (status === 401 || status === 403) {
    metrics.authErrors += 1;
  }

  metrics.endpoints.set(endpoint, endpointMetrics);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateOffset(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function get(path, endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const started = performance.now();
  let status = 0;
  let error = null;

  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: TOKEN
        ? { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
        : { Accept: 'application/json' },
      signal: controller.signal,
    });
    status = response.status;
    await response.arrayBuffer();
  } catch (err) {
    error = err;
  } finally {
    clearTimeout(timeout);
  }

  record(endpoint, status, performance.now() - started, error);
}

async function runTodayFlow() {
  const today = dateOffset(0);
  await get('/health', 'health');
  await get(`/log/daily?date=${today}&tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'log_daily_today');
  await get(`/log/activity?date=${today}`, 'activity_today');
  await get(`/gamification/summary?tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'gamification_summary');
  await get('/calorie-target/me', 'calorie_target');
}

async function runLogFlow() {
  const day = dateOffset(Math.floor(Math.random() * 14));
  await get(`/log/daily?date=${day}&tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'log_daily_history');
  await get('/log/saved-meals', 'saved_meals');
  await get('/activity-preferences', 'activity_preferences');
}

async function runProgressFlow() {
  await get('/body-progress/trend?days=90', 'body_progress_90d');
  await get('/insights/weekly', 'insights_weekly');
  await get('/calorie-target/weekly-adjustment/preview', 'weekly_adjustment_preview');
}

async function runCoachFlow() {
  await get('/coaching/weekly-summary', 'coach_weekly_summary');
  await get('/coaching/insights', 'coach_insights');
  await get('/calorie-target/recommendations/me', 'target_recommendations');
}

async function runProfileFlow() {
  await get('/user/profile', 'profile');
  await get('/subscriptions/current', 'subscription_current');
  await get('/subscriptions/features', 'subscription_features');
  await get('/reminders/preferences', 'reminder_preferences');
}

async function runUserFlow() {
  const roll = Math.random();
  if (roll < 0.36) return runTodayFlow();
  if (roll < 0.58) return runLogFlow();
  if (roll < 0.76) return runProgressFlow();
  if (roll < 0.9) return runCoachFlow();
  return runProfileFlow();
}

async function virtualUser(id, state) {
  while (!state.stop && id <= state.target) {
    await runUserFlow();
    await sleep(800 + Math.random() * 1400);
  }
}

async function runStage(state, durationMs, startTarget, endTarget) {
  const started = Date.now();
  const finishAt = started + durationMs;

  while (Date.now() < finishAt) {
    const elapsed = Date.now() - started;
    state.target = Math.round(startTarget + ((endTarget - startTarget) * elapsed) / durationMs);

    while (state.vus.length < state.target) {
      const id = state.vus.length + 1;
      const promise = virtualUser(id, state);
      state.vus.push(promise);
    }

    await sleep(1000);
  }

  state.target = endTarget;
}

function printSummary(startedAt) {
  if (summaryPrinted) return;
  summaryPrinted = true;

  const durationSec = (Date.now() - startedAt) / 1000;
  const p95 = percentile(metrics.durations, 95);
  const p99 = percentile(metrics.durations, 99);
  const failureRate = metrics.total ? metrics.failed / metrics.total : 0;
  const serverErrorRate = metrics.total ? metrics.serverErrors / metrics.total : 0;
  const authErrorRate = metrics.total ? metrics.authErrors / metrics.total : 0;
  const rps = metrics.total / durationSec;

  console.log('');
  console.log('Realistic read load test summary');
  console.log(`duration_sec=${durationSec.toFixed(1)}`);
  console.log(`requests=${metrics.total}`);
  console.log(`rps=${rps.toFixed(2)}`);
  console.log(`failure_rate=${(failureRate * 100).toFixed(2)}%`);
  console.log(`server_error_rate=${(serverErrorRate * 100).toFixed(2)}%`);
  console.log(`auth_error_rate=${(authErrorRate * 100).toFixed(2)}%`);
  console.log(`latency_avg_ms=${(metrics.durations.reduce((sum, value) => sum + value, 0) / Math.max(1, metrics.durations.length)).toFixed(1)}`);
  console.log(`latency_p95_ms=${p95.toFixed(1)}`);
  console.log(`latency_p99_ms=${p99.toFixed(1)}`);
  console.log(`statuses=${JSON.stringify(Object.fromEntries(metrics.statuses))}`);

  const endpointRows = [...metrics.endpoints.entries()]
    .map(([name, item]) => ({
      name,
      total: item.total,
      failed: item.failed,
      serverErrors: item.serverErrors,
      p95: percentile(item.durations, 95),
      p99: percentile(item.durations, 99),
    }))
    .sort((a, b) => b.p95 - a.p95);

  console.log('slowest_endpoints_by_p95=');
  for (const row of endpointRows.slice(0, 8)) {
    console.log(
      `${row.name} total=${row.total} failed=${row.failed} server_errors=${row.serverErrors} p95_ms=${row.p95.toFixed(1)} p99_ms=${row.p99.toFixed(1)}`,
    );
  }

  if (failureRate >= 0.05 || serverErrorRate >= 0.01 || authErrorRate >= 0.01 || p95 >= 2500 || p99 >= 5000) {
    process.exitCode = 1;
  }
}

async function main() {
  if (!TOKEN) {
    throw new Error('API_TOKEN is required');
  }

  const state = { target: 0, vus: [], stop: false };
  let currentTarget = 0;
  const startedAt = Date.now();
  runStartedAt = startedAt;

  const plannedDurationSec = stages.reduce((total, stage) => total + stage.durationMs, 0) / 1000;
  const peakUsers = Math.max(...stages.map((stage) => stage.target));
  console.log(`Starting ${profile} read load test: ${plannedDurationSec}s, peak ${peakUsers} virtual users`);
  console.log(`target=${BASE}`);

  const progress = setInterval(() => {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(
      `progress elapsed=${elapsedSec}s target_vus=${state.target} requests=${metrics.total} failures=${metrics.failed} server_errors=${metrics.serverErrors}`,
    );
  }, 30_000);

  for (const stage of stages) {
    await runStage(state, stage.durationMs, currentTarget, stage.target);
    currentTarget = stage.target;
  }

  state.stop = true;
  await Promise.allSettled(state.vus);
  clearInterval(progress);
  printSummary(startedAt);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  printSummary(runStartedAt);
  process.exit(130);
});

process.on('SIGTERM', () => {
  printSummary(runStartedAt);
  process.exit(143);
});
