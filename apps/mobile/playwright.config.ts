import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npm run dev:web -- --clear',
    url: 'http://localhost:19006',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      CI: '1',
    },
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:19006',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
