import { test, expect } from '@playwright/test';

test.describe('Mobile web smoke', () => {
  test('loads homepage and shows main tabs', async ({ page }) => {
    await page.goto('/');
    // Wait for the tab bar label "Tiến trình" to appear
    await expect(page.locator('text=Tiến trình')).toBeVisible({ timeout: 10000 });
    // Check expected top bar title for the default tab
    await expect(page.locator('text=Hôm nay')).toBeVisible();
  });
});
