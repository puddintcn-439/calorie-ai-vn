import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 25 },
    { duration: '2m', target: 40 },
    { duration: '2m', target: 25 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2500', 'p(99)<5000'],
    server_error_rate: ['rate<0.01'],
    auth_error_rate: ['rate<0.01'],
  },
};

const BASE = __ENV.TARGET_URL || 'http://host.docker.internal:3000';
const TOKEN = __ENV.API_TOKEN;
const TZ_OFFSET_MINUTES = __ENV.TZ_OFFSET_MINUTES || '420';

export const server_error_rate = new Rate('server_error_rate');
export const auth_error_rate = new Rate('auth_error_rate');

function headers() {
  return TOKEN
    ? {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      }
    : { Accept: 'application/json' };
}

function dateOffset(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function get(path, name, authed = true) {
  const res = http.get(`${BASE}${path}`, {
    headers: authed ? headers() : { Accept: 'application/json' },
    tags: { endpoint: name },
    timeout: '20s',
  });

  server_error_rate.add(res.status >= 500);
  auth_error_rate.add(res.status === 401 || res.status === 403);

  check(res, {
    [`${name} is successful`]: (r) => r.status >= 200 && r.status < 300,
  });

  return res;
}

function runTodayFlow() {
  const today = dateOffset(0);
  get('/health', 'health', false);
  get(`/log/daily?date=${today}&tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'log_daily_today');
  get(`/log/activity?date=${today}`, 'activity_today');
  get(`/gamification/summary?tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'gamification_summary');
  get('/calorie-target/me', 'calorie_target');
}

function runLogFlow() {
  const day = dateOffset(Math.floor(Math.random() * 14));
  get(`/log/daily?date=${day}&tz_offset_minutes=${TZ_OFFSET_MINUTES}`, 'log_daily_history');
  get('/log/saved-meals', 'saved_meals');
  get('/activity-preferences', 'activity_preferences');
}

function runProgressFlow() {
  get('/body-progress/trend?days=90', 'body_progress_90d');
  get('/insights/weekly', 'insights_weekly');
  get('/calorie-target/weekly-adjustment/preview', 'weekly_adjustment_preview');
}

function runCoachFlow() {
  get('/coaching/weekly-summary', 'coach_weekly_summary');
  get('/coaching/insights', 'coach_insights');
  get('/calorie-target/recommendations/me', 'target_recommendations');
}

function runProfileFlow() {
  get('/user/profile', 'profile');
  get('/subscriptions/current', 'subscription_current');
  get('/subscriptions/features', 'subscription_features');
  get('/reminders/preferences', 'reminder_preferences');
}

export default function () {
  if (!TOKEN) {
    throw new Error('API_TOKEN is required for realistic authenticated load test');
  }

  const roll = Math.random();
  if (roll < 0.36) {
    runTodayFlow();
  } else if (roll < 0.58) {
    runLogFlow();
  } else if (roll < 0.76) {
    runProgressFlow();
  } else if (roll < 0.9) {
    runCoachFlow();
  } else {
    runProfileFlow();
  }

  sleep(0.8 + Math.random() * 1.4);
}
