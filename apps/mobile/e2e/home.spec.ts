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
    // Wait for the tab bar label "Tiến trình" to appear
    await expect(page.getByRole('tab', { name: /Tiến trình/ })).toBeVisible({ timeout: 10000 });
    // Check expected top bar title for the default tab
    await expect(page.getByRole('tab', { name: /Hôm nay/ })).toBeVisible();
  });
});
