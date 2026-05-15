import { test, expect } from '@playwright/test';
import { setAuthToken, jsonResponse } from './helpers';

test.describe('Strength session', () => {
  test('create strength session and POST to /log/activity', async ({ page }) => {
    await setAuthToken(page);

    let postCalled = false;

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

    await page.goto('/strength');

    await page.getByPlaceholder('Ghi chú cho buổi tập...').fill('Felt strong today');
    await page.getByPlaceholder('Bài tập #1').fill('Squat');
    await page.getByPlaceholder('Reps').fill('5');
    await page.getByPlaceholder('Weight (kg)').fill('80');

    // Add the set
    await page.getByText('Add').click();

    // Submit session
    await page.getByText('Save Strength Session').click();

    await page.waitForTimeout(300);
    expect(postCalled).toBeTruthy();
  });
});
