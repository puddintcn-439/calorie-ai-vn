import { test, expect } from '@playwright/test';
import { setAuthToken, jsonResponse } from './helpers';

test.describe('Mobile web smoke', () => {
  test('loads homepage and shows main tabs', async ({ page }) => {
    // Pretend user is logged in and mock minimal profile to render tabs
    await setAuthToken(page);
    await page.route('**/user/profile', async (route) => {
      await route.fulfill(jsonResponse({ full_name: 'Test', weight_kg: 65, height_cm: 170, age: 30, gender: 'male' }));
    });
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /Hôm nay/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: /Scan/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Log/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Coach/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Hồ sơ/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Cơ thể/ })).toHaveCount(0);
  });
});
