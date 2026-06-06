import { test, expect } from '@playwright/test';
import {
  collectImportantConsoleMessages,
  expectNoUnsafeRenderedText,
  gotoApp,
  jsonResponse,
  setAuthToken,
} from './helpers';

test.describe('Coach flows', () => {
  test('scrolls to chat input and sends a coach message', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);
    let coachRequestBody: any = null;

    await setAuthToken(page);
    await page.addInitScript(() => window.localStorage.setItem('app_locale', 'en'));
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({
          id: 'user-1',
          email: 'coach@example.com',
          age: 30,
          gender: 'male',
          height_cm: 170,
          weight_kg: 70,
          goal: 'lose_weight',
          activity_level: 'moderate',
          daily_calorie_target: 1850,
        }));
      }

      if (path === '/log/daily') {
        return route.fulfill(jsonResponse({
          date: '2026-06-02',
          logs: [],
          total_calories: 0,
          total_protein_g: 0,
          target_calories: 1850,
          remaining_calories: 1850,
        }));
      }

      if (path === '/coaching/insights') return route.fulfill(jsonResponse([]));
      if (path === '/coaching/weekly-summary') return route.fulfill(jsonResponse(null));
      if (path === '/subscriptions/features') {
        return route.fulfill(jsonResponse({
          daily_insights: true,
          meal_reminders: true,
          ai_coach: true,
          manual_food_search: true,
          barcode_scanning: true,
          weekly_reports: true,
          correction_tracking: true,
          healthkit_sync: true,
          custom_goals: true,
          priority_support: false,
        }));
      }

      if (path === '/ai/coach') {
        coachRequestBody = request.postDataJSON();
        return route.fulfill(jsonResponse({
          message: 'Use a protein-forward dinner around 450 kcal and keep drinks unsweetened.',
          actions: [
            { type: 'open_scan', label: 'Scan meal' },
          ],
        }));
      }

      if (
        path.startsWith('/log/')
        || path.startsWith('/user/')
        || path.startsWith('/coaching/')
        || path.startsWith('/subscriptions/')
        || path.startsWith('/ai/')
      ) {
        return route.fulfill(jsonResponse({}));
      }

      return route.continue();
    });

    await gotoApp(page, '/coach');

    const input = page.getByPlaceholder(/400 kcal left/i);
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('I have 400 kcal left. What should I eat tonight?');
    await page.getByRole('button', { name: 'Send to Coach' }).click();

    await expect(page.getByText('I have 400 kcal left. What should I eat tonight?')).toBeVisible();
    await expect(page.getByText(/protein-forward dinner around 450 kcal/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('coach-action-open_scan')).toBeVisible();
    await page.getByTestId('coach-action-open_scan').click();
    await expect(page).toHaveURL(/\/scan$/);
    expect(coachRequestBody).toMatchObject({
      message: 'I have 400 kcal left. What should I eat tonight?',
      today_calories: 0,
      target_calories: 1850,
    });
    await expectNoUnsafeRenderedText(page);
    expect(consoleMessages).toEqual([]);
  });
});
