import { test, expect } from '@playwright/test';
import { gotoApp, setAuthToken, jsonResponse, setLocale } from './helpers';

test.describe('Mobile web smoke', () => {
  test('loads homepage and shows main tabs', async ({ page }) => {
    // Pretend user is logged in and mock minimal profile to render tabs
    await setAuthToken(page);
    await page.route('**/user/profile', async (route) => {
      await route.fulfill(jsonResponse({ full_name: 'Test', weight_kg: 65, height_cm: 170, age: 30, gender: 'male' }));
    });
    await gotoApp(page, '/');
    await expect(page.getByText('Tổng quan hôm nay')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Quét').last()).toBeVisible();
    await expect(page.getByText('Nhật ký').last()).toBeVisible();
    await expect(page.getByText('Coach').last()).toBeVisible();
    await expect(page.getByText('Hồ sơ').last()).toBeVisible();
  });

  test('uses stored English locale for primary dashboard copy', async ({ page }) => {
    await setAuthToken(page);
    await setLocale(page);
    await page.route('**/user/profile', async (route) => {
      await route.fulfill(jsonResponse({ full_name: 'Test', weight_kg: 65, height_cm: 170, age: 30, gender: 'male' }));
    });

    await gotoApp(page, '/');

    await expect(page.getByText("Today's overview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Missing target inputs')).toBeVisible();
    await expect(page.getByText('Scan meal').last()).toBeVisible();
    await expect(page.getByText('Profile').last()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Tổng quan hôm nay');
    await expect(page.locator('body')).not.toContainText('phút');
  });
});
