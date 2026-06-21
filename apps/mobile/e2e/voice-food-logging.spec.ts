import { expect, test } from '@playwright/test';
import { gotoApp, jsonResponse, setAuthToken, setLocale } from './helpers';

const spokenMeal = 'Trưa nay tôi ăn một bát phở bò và một cốc trà đá.';

function successfulVoiceScan() {
  return {
    success: true,
    scan_id: 'voice-scan-1',
    transcript: spokenMeal,
    items: [
      {
        name: 'Beef pho',
        name_vi: 'Phở bò',
        category: 'noodle',
        quantity: 1,
        unit: 'bowl',
        estimated_grams: 500,
        calories: 480,
        protein_g: 28,
        carbs_g: 62,
        fat_g: 12,
        confidence: 0.92,
      },
      {
        name: 'Iced tea',
        name_vi: 'Trà đá',
        category: 'drink',
        quantity: 1,
        unit: 'glass',
        estimated_grams: 300,
        calories: 5,
        protein_g: 0,
        carbs_g: 1,
        fat_g: 0,
        confidence: 0.9,
      },
    ],
    total_calories: 485,
    total_protein_g: 28,
    total_carbs_g: 63,
    total_fat_g: 12,
    ai_confidence: 0.91,
    processing_ms: 900,
    metadata: { input_mode: 'voice_transcript' },
  };
}

async function openVoiceMode(page: import('@playwright/test').Page) {
  await gotoApp(page, '/scan');
  await page.getByTestId('scan-mode-more').click();
  await page.getByTestId('scan-mode-voice').click();
}

test.describe('Voice food logging fallback', () => {
  test.beforeEach(async ({ page }) => {
    await setAuthToken(page);
    await setLocale(page, 'vi');
  });

  test('keeps transcript editable, shows foods and calories, and confirms the log', async ({ page }) => {
    const loggedFoods: Array<Record<string, unknown>> = [];
    page.on('dialog', (dialog) => dialog.dismiss());
    await page.route('**/*', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({ id: 'user-1', daily_calorie_target: 2000 }));
      }
      if (path === '/ai/scan/voice') {
        expect(request.postDataJSON().transcript).toBe(spokenMeal);
        return route.fulfill(jsonResponse(successfulVoiceScan()));
      }
      if (path === '/log' && request.method() === 'POST') {
        const body = request.postDataJSON();
        loggedFoods.push(body);
        return route.fulfill(jsonResponse({
          id: `voice-log-${loggedFoods.length}`,
          user_id: 'user-1',
          ...body,
        }));
      }
      if (path.startsWith('/telemetry')
        || path.startsWith('/reminder')
        || path.startsWith('/today')
        || path.startsWith('/log')
        || path.startsWith('/activity-preferences')
        || path.startsWith('/gamification')) {
        return route.fulfill(jsonResponse(request.method() === 'GET' ? {} : { ok: true }));
      }
      return route.continue();
    });

    await openVoiceMode(page);

    await expect(page.getByTestId('voice-record-button')).toHaveCount(0);
    await expect(page.getByText(/Bản web chưa hỗ trợ ghi âm trực tiếp/i)).toBeVisible();

    const transcript = page.getByTestId('voice-transcript-input');
    await transcript.fill(spokenMeal);
    await transcript.fill(`${spokenMeal} Ít bánh phở.`);
    await transcript.fill(spokenMeal);
    await expect(transcript).toHaveValue(spokenMeal);
    await page.getByTestId('voice-analyze-button').click();

    await expect(page.getByText('Phở bò', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Trà đá', { exact: true })).toBeVisible();
    // The Vietnamese portion parser maps "một bát" to the app's bowl preset
    // and scales the provider's 500 g estimate before rendering.
    await expect(page.getByTestId('scan-result-calories').first()).toContainText('336');
    await expect(transcript).toBeEditable();

    await page.getByTestId('scan-log-meal-button').click();
    await expect.poll(() => loggedFoods.length).toBe(2);
    expect(loggedFoods.map((food) => food.name)).toEqual(['Phở bò', 'Trà đá']);
  });

  test('shows a friendly fallback quickly when Gemini voice parsing fails', async ({ page }) => {
    await page.route('**/*', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === '/user/profile') {
        return route.fulfill(jsonResponse({ id: 'user-1', daily_calorie_target: 2000 }));
      }
      if (path === '/ai/scan/voice') {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Voice transcription is temporarily unavailable.' }),
        });
      }
      if (path.startsWith('/telemetry')) {
        return route.fulfill(jsonResponse({ ok: true }));
      }
      return route.continue();
    });

    await openVoiceMode(page);
    await page.getByTestId('voice-transcript-input').fill(spokenMeal);
    const startedAt = Date.now();
    await page.getByTestId('voice-analyze-button').click();

    await expect(page.getByText(/Không thể phân tích giọng nói lúc này/i)).toBeVisible({ timeout: 5_000 });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    await expect(page.getByTestId('voice-transcript-input')).toHaveValue(spokenMeal);
    await expect(page.getByTestId('voice-transcript-input')).toBeEditable();
  });
});
