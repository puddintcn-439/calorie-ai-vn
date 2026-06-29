import { test, expect } from '@playwright/test';
import { gotoApp, setAuthToken, jsonResponse } from './helpers';

test.describe('Profile flows', () => {
  test('edit and save profile triggers PATCH to backend', async ({ page }) => {
    await setAuthToken(page);

    let patchCalled = false;

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const isApiPath = /^\/(user|reminders|subscriptions|log|activity-preferences|calorie-target|insights)(\/|$)/.test(path);
      if (route.request().resourceType() === 'document' && url.port !== '3000') {
        await route.continue();
        return;
      }
      if (url.port !== '3000' && !isApiPath) {
        await route.continue();
        return;
      }

      const method = route.request().method();

      if (path === '/user/profile' && method === 'GET') {
        await route.fulfill(jsonResponse({ full_name: '', weight_kg: 65, height_cm: 170, age: 25, gender: 'male' }));
      } else if (path === '/user/profile' && method === 'PATCH') {
        patchCalled = true;
        await route.fulfill(jsonResponse({ full_name: 'Test User', weight_kg: 70, height_cm: 175, age: 30, gender: 'male' }));
      } else if (path === '/reminders/preferences') {
        await route.fulfill(jsonResponse({
          allow_push_notifications: false,
          breakfast_reminder_enabled: false,
          lunch_reminder_enabled: false,
          dinner_reminder_enabled: false,
          snack_reminder_enabled: false,
          nudge_motivation_style: 'neutral',
        }));
      } else if (path === '/reminders/nudge-test') {
        await route.fulfill(jsonResponse({ title: 'Lunch reminder', body: 'Keep it simple.' }));
      } else if (path === '/reminders/effectiveness') {
        await route.fulfill(jsonResponse({
          days: 30,
          sent: 0,
          opened: 0,
          acted: 0,
          ignored: 0,
          open_rate: 0,
          action_rate: 0,
          ignore_rate: 0,
          effectiveness_score: 0,
          best_meal: null,
          weakest_meal: null,
          recommendation: 'No reminder data yet.',
          patterns: [],
          by_meal: {
            breakfast: { sent: 0, opened: 0, acted: 0, ignored: 0, open_rate: 0, action_rate: 0, ignore_rate: 0 },
            lunch: { sent: 0, opened: 0, acted: 0, ignored: 0, open_rate: 0, action_rate: 0, ignore_rate: 0 },
            dinner: { sent: 0, opened: 0, acted: 0, ignored: 0, open_rate: 0, action_rate: 0, ignore_rate: 0 },
            snack: { sent: 0, opened: 0, acted: 0, ignored: 0, open_rate: 0, action_rate: 0, ignore_rate: 0 },
          },
          by_action: {},
        }));
      } else if (path === '/subscriptions/current') {
        await route.fulfill(jsonResponse({ tier: 'free', is_active: true }));
      } else if (path === '/subscriptions/features') {
        await route.fulfill(jsonResponse({
          ai_scans_per_month: 5,
          ai_coach_messages_per_day: 5,
          meal_reminders: false,
          weekly_reports: false,
        }));
      } else if (path === '/log/activity' || path === '/activity-preferences') {
        await route.fulfill(jsonResponse([]));
      } else if (path === '/log/daily') {
        await route.fulfill(jsonResponse({ logs: [], total_calories: 0 }));
      } else if (path.startsWith('/calorie-target') || path.startsWith('/insights')) {
        await route.fulfill(jsonResponse({}));
      } else {
        await route.fulfill(jsonResponse({}));
      }
    });

    await gotoApp(page, '/profile');

    await page.getByText('Hồ sơ của bạn').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('Hoàn tất hồ sơ', { exact: true }).click();
    await page.waitForTimeout(350);
    const overviewBox = await page.getByTestId('profile-completion-overview').boundingBox();
    expect(overviewBox?.y).toBeGreaterThanOrEqual(0);
    expect(overviewBox?.y).toBeLessThan(220);

    await expect(page.getByTestId('profile-incomplete-body')).toContainText('Đã hoàn thiện');
    await expect(page.getByTestId('profile-incomplete-activity')).toContainText('Cần hoàn thiện');
    await expect(page.getByTestId('profile-incomplete-safety')).toContainText('Cần hoàn thiện');
    await expect(page.getByTestId('profile-incomplete-goal-plan')).toContainText('Cần hoàn thiện');
    await expect(page.getByTestId('profile-incomplete-movement')).toContainText('Cần hoàn thiện');
    await page.getByText('Cơ thể', { exact: true }).click();

    // Wait for inputs to appear after expansion
    await page.getByPlaceholder('65').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByPlaceholder('65').fill('70');
    await page.getByPlaceholder('170').fill('175');
    await page.getByPlaceholder('25').fill('30');
    await expect(page.getByTestId('profile-incomplete-body')).toContainText('Thiếu thông tin');

    await page.getByText('Lưu', { exact: true }).click();

    await page.waitForTimeout(300);
    expect(patchCalled).toBeTruthy();
    await expect(page.getByTestId('profile-incomplete-body')).toContainText('Đã hoàn thiện');
  });
});
