**Load & Performance Test Plan**

- **Goal:** Validate backend stability under modest load and capture baseline metrics before production traffic.
- **Tool:** k6 (https://k6.io)
- **Script:** `tests/load/k6/basic.js` (requests `/health`, configurable via `TARGET_URL`).
- **Run locally:**

```bash
# Using Docker (no local k6 install required)
docker run --rm -v $(pwd)/tests/load:/scripts -e TARGET_URL=http://localhost:3000 loadimpact/k6 run /scripts/k6/basic.js
```

- **Run in CI:** Use the workflow `Load test` in `.github/workflows/load-test.yml` (Dispatch with `target_url`).

- **Baseline thresholds (example):**
  - 95th percentile latency < 500ms
  - Error rate < 1%
  - No HTTP 5xx responses

- **Next steps:**
  1. Run against staging URL; collect metrics (latency, errors, throughput).
  2. Increase VUs/duration to simulate peak load once baseline stable.
  3. Tune backend concurrency, DB pool, and autoscaling accordingly.
