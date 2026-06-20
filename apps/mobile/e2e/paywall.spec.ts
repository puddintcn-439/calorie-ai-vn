import { test, expect } from '@playwright/test';
import {
  collectImportantConsoleMessages,
  expectNoUnsafeRenderedText,
  gotoApp,
  jsonResponse,
  setAuthToken,
  setLocale,
} from './helpers';

test.describe('Paywall flows', () => {
  test('routes Health Sync premium gate to contextual paywall', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);

    await setAuthToken(page);
    await setLocale(page);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (path === '/subscriptions/features') {
        return route.fulfill(jsonResponse({
          daily_insights: true,
          meal_reminders: true,
          ai_coach: true,
          manual_food_search: true,
          barcode_scanning: true,
          weekly_reports: false,
          correction_tracking: false,
          healthkit_sync: false,
          custom_goals: false,
          priority_support: false,
        }));
      }

      if (path === '/subscriptions/current') {
        return route.fulfill(jsonResponse({
          id: 'sub-free',
          user_id: 'user-1',
          tier: 'free',
          is_active: true,
        }));
      }

      if (path.startsWith('/subscriptions/')) {
        return route.fulfill(jsonResponse({ ok: true }));
      }

      if (path.startsWith('/log/') || path.startsWith('/user/')) {
        return route.fulfill(jsonResponse({}));
      }

      return route.continue();
    });

    await gotoApp(page, '/health-sync');

    await expect(page.getByText('Premium feature')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('health-sync-upgrade-button').click();

    await expect(page).toHaveURL(/\/paywall\?returnTo=%2Fhealth-sync&feature=healthkit_sync/);
    await expect(page.getByText(/After upgrading, you will return to Health Sync/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('paywall-tier-pro-button')).toBeVisible();
    await expectNoUnsafeRenderedText(page);
    expect(consoleMessages).toEqual([]);
  });
});
