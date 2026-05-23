import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

const BASE = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
