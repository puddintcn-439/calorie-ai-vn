import { test, expect } from '@playwright/test';
import { setAuthToken, jsonResponse } from './helpers';

test.describe('Profile flows', () => {
  test('edit and save profile triggers PATCH to backend', async ({ page }) => {
    await setAuthToken(page);

    let patchCalled = false;

    await page.route('**/user/profile', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill(jsonResponse({ full_name: '', weight_kg: 65, height_cm: 170, age: 25, gender: 'male' }));
      } else if (method === 'PATCH') {
        patchCalled = true;
        await route.fulfill(jsonResponse({ full_name: 'Test User', weight_kg: 70, height_cm: 175, age: 30, gender: 'male' }));
      } else {
        await route.continue();
      }
    });

    await page.goto('/profile');

    // Expand basic info section if collapsed
    const header = page.getByText('Thiết lập thông tin thể trạng');
    if (await header.count() > 0) await header.click();

    await page.getByPlaceholder('65').fill('70');
    await page.getByPlaceholder('170').fill('175');
    await page.getByPlaceholder('25').fill('30');

    await page.getByText('Lưu hồ sơ').click();

    await page.waitForTimeout(300);
    expect(patchCalled).toBeTruthy();
  });
});
