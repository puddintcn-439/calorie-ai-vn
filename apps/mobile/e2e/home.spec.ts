import { test, expect } from '@playwright/test';
import { gotoApp, setAuthToken, jsonResponse } from './helpers';

test.describe('Mobile web smoke', () => {
  test('loads homepage and shows main tabs', async ({ page }) => {
    // Pretend user is logged in and mock minimal profile to render tabs
    await setAuthToken(page);
    await page.route('**/user/profile', async (route) => {
      await route.fulfill(jsonResponse({ full_name: 'Test', weight_kg: 65, height_cm: 170, age: 30, gender: 'male' }));
    });
    await gotoApp(page, '/');
    await expect(page.getByText('Tổng quan hôm nay')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Scan').last()).toBeVisible();
    await expect(page.getByText('Log').last()).toBeVisible();
    await expect(page.getByText('Coach').last()).toBeVisible();
    await expect(page.getByText('Hồ sơ').last()).toBeVisible();
  });
});
