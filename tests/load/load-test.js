/**
 * Load Test - Apache JMeter Script (k6 alternative)
 * 
 * Simulates 100+ concurrent users hitting key API endpoints
 * 
 * Run: k6 run load-test.js --vus 100 --duration 5m
 * Report: k6 run load-test.js --vus 100 --duration 5m -o json=result.json
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || 'test-token-12345';

// Custom metrics
const requestDuration = new Trend('request_duration');
const errorRate = new Rate('error_rate');
const authErrors = new Counter('auth_errors');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '1m', target: 20 }, // Ramp up to 20 VUs
    { duration: '2m', target: 100 }, // Ramp up to 100 VUs
    { duration: '1m', target: 100 }, // Stay at 100 VUs
    { duration: '1m', target: 50 }, // Ramp down to 50 VUs
    { duration: '1m', target: 0 }, // Ramp down to 0 VUs
  ],
  thresholds: {
    // 95% of requests must complete below 500ms
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    // Error rate must be below 5%
    'error_rate': ['value<0.05'],
    // Success rate must be above 95%
    'success_rate': ['value>0.95'],
  },
};

export function setup() {
  // Login and get auth token
  const loginRes = http.post(`${BASE_URL}/auth/login`, {
    email: 'load-test@example.com',
    password: 'LoadTest123!',
  });

  return {
    token: loginRes.json('access_token'),
  };
}

export default function (data) {
  const authHeaders = {
    headers: { Authorization: `Bearer ${data.token}` },
  };

  // Test 1: Health check
  {
    const res = http.get(`${BASE_URL}/health`);
    const startTime = new Date().getTime();
    requestDuration.add(new Date().getTime() - startTime);
    check(res, {
      'health status 200': (r) => r.status === 200,
      'health has status field': (r) => r.json('status') !== undefined,
    });
    successRate.add(res.status === 200 ? 1 : 0);
    errorRate.add(res.status >= 400 ? 1 : 0);
  }

  sleep(0.5);

  // Test 2: Get user profile
  {
    const res = http.get(`${BASE_URL}/user/profile`, authHeaders);
    requestDuration.add(res.timings.duration);
    check(res, {
      'profile status 200': (r) => r.status === 200,
      'profile has daily_calorie_target': (r) =>
        r.json('daily_calorie_target') !== undefined,
    });
    successRate.add(res.status === 200 ? 1 : 0);
    errorRate.add(res.status >= 400 ? 1 : 0);
    if (res.status === 401) authErrors.add(1);
  }

  sleep(0.5);

  // Test 3: Get calorie-target recommendations
  {
    const res = http.get(
      `${BASE_URL}/calorie-target/recommendations/me`,
      authHeaders,
    );
    requestDuration.add(res.timings.duration);
    check(res, {
      'recommendations status 200': (r) => r.status === 200,
      'recommendations has meals': (r) => Array.isArray(r.json('meals')),
      'recommendations has daily_target': (r) =>
        r.json('daily_target') !== undefined,
    });
    successRate.add(res.status === 200 ? 1 : 0);
    errorRate.add(res.status >= 400 ? 1 : 0);
  }

  sleep(0.5);

  // Test 4: Get weekly insights
  {
    const res = http.get(`${BASE_URL}/insights/week`, authHeaders);
    requestDuration.add(res.timings.duration);
    check(res, {
      'insights status 200': (r) => r.status === 200,
      'insights has average_daily_calories': (r) =>
        r.json('average_daily_calories') !== undefined,
      'insights has adherence_percentage': (r) =>
        r.json('adherence_percentage') !== undefined,
    });
    successRate.add(res.status === 200 ? 1 : 0);
    errorRate.add(res.status >= 400 ? 1 : 0);
  }

  sleep(1);

  // Test 5: Calculate calorie target (heavier operation)
  {
    const payload = JSON.stringify({
      weight_kg: 75,
      height_cm: 180,
      age: 30,
      gender: 'male',
      activity_level: 'moderate',
      goal: 'maintain',
    });

    const res = http.post(`${BASE_URL}/calorie-target/calculate`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.token}`,
      },
    });

    requestDuration.add(res.timings.duration);
    check(res, {
      'calculate status 201': (r) => r.status === 201,
      'calculate has daily_calorie_target': (r) =>
        r.json('daily_calorie_target') !== undefined,
      'calculate has bmr': (r) => r.json('bmr') !== undefined,
    });
    successRate.add(res.status === 201 ? 1 : 0);
    errorRate.add(res.status >= 400 ? 1 : 0);
  }

  sleep(2);
}

export function teardown(data) {
  console.log(`Load test completed.`);
  console.log(`Total error rate: ${errorRate.value}`);
  console.log(`Total success rate: ${successRate.value}`);
}
