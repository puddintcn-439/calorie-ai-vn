import { test, expect } from '@playwright/test';
import { gotoApp, setAuthToken, jsonResponse } from './helpers';

test.describe('Strength session', () => {
  test('create strength session and POST to /log/activity', async ({ page }) => {
    await setAuthToken(page);

    let postCalled = false;

    await page.route('**/user/profile', async (route) => {
      await route.fulfill(jsonResponse({ id: 'user-1', email: 'test@example.com' }));
    });

    await page.route('**/log/activity', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill(jsonResponse([]));
      } else if (method === 'POST') {
        postCalled = true;
        await route.fulfill(jsonResponse({ id: 'activity-1' }));
      } else {
        await route.continue();
      }
    });

    await gotoApp(page, '/strength');

    await page.getByPlaceholder('Ghi chú buổi tập...').fill('Felt strong today');
    await page.getByPlaceholder('Bài tập #1').fill('Squat');
    await page.getByPlaceholder('Reps').fill('5');
    await page.getByPlaceholder('Kg').fill('80');

    await page.getByText('Thêm set').click();
    await page.getByText('Lưu buổi tập').click();

    await page.waitForTimeout(300);
    expect(postCalled).toBeTruthy();
  });
});
