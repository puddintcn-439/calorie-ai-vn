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

    // Wait for the profile header to be visible and expand the basic info section
    const header = page.getByText('Thiết lập thông tin thể trạng');
    await header.waitFor({ state: 'visible', timeout: 5000 });
    if (await header.count() > 0) {
      // Dispatch a DOM click event to ensure React touch handlers fire even when a transient overlay
      // is present that might intercept pointer events.
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('*')).find((n) => n.textContent?.trim() === 'Thiết lập thông tin thể trạng');
        if (el) {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
      });
    }

    // Wait for inputs to appear after expansion
    await page.getByPlaceholder('65').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByPlaceholder('65').fill('70');
    await page.getByPlaceholder('170').fill('175');
    await page.getByPlaceholder('25').fill('30');

    // Dispatch a DOM click for the save button to work around transient overlays
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('*')).filter((n) => n.textContent?.trim() === 'Lưu hồ sơ');
      const el = candidates.find((n) => {
        const style = window.getComputedStyle(n as Element);
        return style.cursor === 'pointer' || (n as HTMLElement).getAttribute('tabindex') !== null || !!(n as HTMLElement).closest('button, [role="button"], [tabindex]');
      }) || candidates[0];
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });

    await page.waitForTimeout(300);
    expect(patchCalled).toBeTruthy();
  });
});
