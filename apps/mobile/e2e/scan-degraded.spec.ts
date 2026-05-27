import { test, expect } from '@playwright/test';
import {
  collectImportantConsoleMessages,
  expectNoUnsafeRenderedText,
  gotoApp,
  jsonResponse,
  setAuthToken,
} from './helpers';

test.describe('Scan degraded AI states', () => {
  test('shows retryable notice when text scan is quota limited without rendering unsafe result totals', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);
    page.on('dialog', (dialog) => dialog.dismiss());

    await setAuthToken(page);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (url.port !== '3000') return route.continue();

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({
          id: 'user-1',
          email: 'scan@example.com',
          age: 25,
          gender: 'male',
          height_cm: 170,
          weight_kg: 75,
          goal: 'lose_weight',
          activity_level: 'moderate',
          daily_calorie_target: 1850,
        }));
      }

      if (path === '/ai/scan/text') {
        return route.fulfill(jsonResponse({
          success: false,
          scan_id: 'quota-scan',
          items: [],
          total_calories: 0,
          total_calories_min: 0,
          total_calories_max: 0,
          total_protein_g: 0,
          total_carbs_g: 0,
          total_fat_g: 0,
          ai_confidence: 0,
          processing_ms: 30000,
          metadata: {
            ai_fallback: 'quota_or_rate_limited',
            parse_mode: 'text',
          },
        }));
      }

      if (request.method() !== 'GET') return route.fulfill(jsonResponse({ ok: true }));
      return route.fulfill(jsonResponse({}));
    });

    await gotoApp(page, '/scan');
    await page.getByTestId('scan-mode-text').click();
    await page.locator('textarea, input, [contenteditable="true"]').first().fill('tra sua matcha latte 500ml');
    await page.getByText('Phan tich').click();

    await expect(page.getByText(/quota\/rate limit/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Th|th.*l.i/i).first()).toBeVisible();
    await expect(page.getByText('Log meal')).toHaveCount(0);
    await expectNoUnsafeRenderedText(page);
    expect(consoleMessages).toEqual([]);
  });

  test('lets users retry a timed out text scan and recover to a loggable result', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);
    let scanAttempts = 0;
    page.on('dialog', (dialog) => dialog.dismiss());

    await setAuthToken(page);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (url.port !== '3000') return route.continue();

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({
          id: 'user-1',
          email: 'scan@example.com',
          age: 25,
          gender: 'male',
          height_cm: 170,
          weight_kg: 75,
          goal: 'lose_weight',
          activity_level: 'moderate',
          daily_calorie_target: 1850,
        }));
      }

      if (path === '/ai/scan/text') {
        scanAttempts += 1;

        if (scanAttempts === 1) {
          return route.fulfill(jsonResponse({
            success: false,
            scan_id: 'timeout-scan',
            items: [],
            total_calories: 0,
            total_calories_min: 0,
            total_calories_max: 0,
            total_protein_g: 0,
            total_carbs_g: 0,
            total_fat_g: 0,
            ai_confidence: 0,
            processing_ms: 30000,
            metadata: {
              ai_fallback: 'timeout',
              parse_mode: 'text',
            },
          }));
        }

        return route.fulfill(jsonResponse({
          success: true,
          scan_id: 'retry-success-scan',
          items: [
            {
              name: 'Matcha latte',
              name_vi: 'Tra sua matcha latte',
              estimated_grams: 500,
              calories: 360,
              calories_min: 300,
              calories_max: 430,
              protein_g: 8,
              carbs_g: 58,
              fat_g: 12,
              confidence: 0.78,
            },
          ],
          total_calories: 360,
          total_calories_min: 300,
          total_calories_max: 430,
          total_protein_g: 8,
          total_carbs_g: 58,
          total_fat_g: 12,
          ai_confidence: 0.78,
          processing_ms: 1200,
          metadata: {
            parse_mode: 'text',
          },
        }));
      }

      if (request.method() !== 'GET') return route.fulfill(jsonResponse({ ok: true }));
      return route.fulfill(jsonResponse({}));
    });

    await gotoApp(page, '/scan');
    await page.getByTestId('scan-mode-text').click();
    await page.locator('textarea, input, [contenteditable="true"]').first().fill('tra sua matcha latte 500ml');
    await page.getByText('Phan tich').click();

    await expect(page.getByTestId('scan-notice-body')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('scan-retry-button')).toBeVisible();
    await page.getByTestId('scan-retry-button').click();

    await expect(page.getByTestId('scan-notice-body')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText('Log meal')).toBeVisible({ timeout: 15000 });
    await expectNoUnsafeRenderedText(page);
    expect(scanAttempts).toBe(2);
    expect(consoleMessages).toEqual([]);
  });
});
