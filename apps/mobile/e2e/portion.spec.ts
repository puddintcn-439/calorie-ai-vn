import { expect, test } from '@playwright/test';
import { gotoApp, jsonResponse, mockNinetyDayJourneyApi, setAuthToken } from './helpers';

test.describe('Precise portion editing', () => {
  test('prompts for a missing portion and scales calories and macros when grams change', async ({ page }) => {
    await setAuthToken(page);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({
          id: 'user-1',
          email: 'portion@example.com',
          age: 28,
          gender: 'female',
          height_cm: 162,
          weight_kg: 58,
          goal: 'maintain',
          activity_level: 'moderate',
        }));
      }

      if (path === '/ai/scan/text') {
        return route.fulfill(jsonResponse({
          success: true,
          scan_id: 'portion-scan',
          items: [{
            name: 'Steamed bun',
            name_vi: 'Bánh bao',
            category: 'snack',
            quantity: 1,
            unit: 'piece',
            estimated_grams: 100,
            calories: 200,
            calories_min: 180,
            calories_max: 220,
            protein_g: 8,
            carbs_g: 30,
            fat_g: 6,
            confidence: 0.9,
          }],
          total_calories: 200,
          total_calories_min: 180,
          total_calories_max: 220,
          total_protein_g: 8,
          total_carbs_g: 30,
          total_fat_g: 6,
          ai_confidence: 0.9,
          processing_ms: 400,
        }));
      }

      if (path.startsWith('/telemetry') || path.startsWith('/log') || path.startsWith('/activity-preferences') || path.startsWith('/gamification')) {
        return route.fulfill(jsonResponse(request.method() === 'GET' ? [] : { ok: true }));
      }

      return route.continue();
    });

    await gotoApp(page, '/scan?mode=text');
    await page.locator('textarea').first().fill('bánh bao');
    await page.getByTestId('scan-analyze-text-button').click();

    await expect(page.getByTestId('scan-portion-sheet-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('scan-portion-sheet-preset-50g')).toBeVisible();
    await expect(page.getByTestId('scan-portion-sheet-preset-100g')).toBeVisible();
    await expect(page.getByTestId('scan-portion-sheet-preset-bowl')).toBeVisible();
    await expect(page.getByTestId('scan-portion-sheet-preset-piece')).toBeVisible();

    await page.getByTestId('scan-portion-sheet-field').fill('200');
    await page.getByTestId('scan-portion-confirm').click();

    await expect(page.getByTestId('scan-result-calories')).toContainText('400');
    await expect(page.getByTestId('scan-result-macros')).toContainText('16');
    await expect(page.getByTestId('scan-result-macros')).toContainText('60');
    await expect(page.getByTestId('scan-result-macros')).toContainText('12');
  });

  test('parses explicit gram portions from text without showing the missing-portion prompt', async ({ page }) => {
    await setAuthToken(page);
    await page.route('**/user/profile', (route) => route.fulfill(jsonResponse({ id: 'user-1' })));
    await page.route('**/ai/scan/text', (route) => route.fulfill(jsonResponse({
      success: true,
      scan_id: 'explicit-portion',
      items: [{
        name: 'Steamed bun',
        name_vi: 'Bánh bao',
        category: 'snack',
        quantity: 1,
        unit: 'piece',
        estimated_grams: 100,
        calories: 200,
        protein_g: 8,
        carbs_g: 30,
        fat_g: 6,
        confidence: 0.9,
      }],
      total_calories: 200,
      total_protein_g: 8,
      total_carbs_g: 30,
      total_fat_g: 6,
      ai_confidence: 0.9,
      processing_ms: 400,
    })));
    await page.route('**/telemetry/**', (route) => route.fulfill(jsonResponse({ ok: true })));

    await gotoApp(page, '/scan?mode=text');
    await page.locator('textarea').first().fill('bánh bao 200g');
    await page.getByTestId('scan-analyze-text-button').click();

    await expect(page.getByTestId('scan-portion-sheet-root')).toHaveCount(0);
    await expect(page.getByTestId('scan-result-calories')).toContainText('400', { timeout: 15_000 });
  });

  test('updates the meal edit nutrition preview when grams change', async ({ page }) => {
    await setAuthToken(page);
    const mock = await mockNinetyDayJourneyApi(page);
    const breakfast = mock.today.logs[0];

    await gotoApp(page, '/log');
    await page.getByTestId(`log-edit-${breakfast.id}`).click();

    await expect(page.getByTestId('log-edit-portion-field')).toHaveValue('220');
    await expect(page.getByTestId('log-edit-calories')).toHaveValue(String(breakfast.calories));

    await page.getByTestId('log-edit-portion-field').fill('440');

    await expect(page.getByTestId('log-edit-calories')).toHaveValue(String(breakfast.calories * 2));
    await expect(page.getByTestId('log-edit-protein')).toHaveValue('48');
    await expect(page.getByTestId('log-edit-carbs')).toHaveValue('84');
    await expect(page.getByTestId('log-edit-fat')).toHaveValue('24');
  });
});
