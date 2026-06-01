import { test, expect } from '@playwright/test';
import {
  collectImportantConsoleMessages,
  expectBottomNavDoesNotCoverInteractiveContent,
  expectNoUnsafeRenderedText,
  gotoApp,
  mockNinetyDayJourneyApi,
  setAuthToken,
} from './helpers';

const JOURNEY_ROUTES = [
  { name: 'Today', path: '/', expected: [/TRỢ LÝ GIẢM CÂN|WEIGHT LOSS ASSISTANT/i, /90\s*ng|90\s*day/i, /1[.,]?[78]\d{2}/] },
  { name: 'Log', path: '/log', expected: [/High protein lunch/i, /730/] },
  { name: 'Progress', path: '/progress', expected: [/90/, /84%|84\s*%/] },
  { name: 'Coach', path: '/coach', expected: [/KẾ HOẠCH HÔM NAY|TODAY'S PLAN/i, /KẾ HOẠCH 7 NGÀY|7-DAY PLAN/i, /97%|97\s*%/, /21/] },
  { name: 'Insights', path: '/insights', expected: [/97%|97\s*%/, /21/] },
];

test.describe('90-day journey production smoke', () => {
  test('renders long-term journey data without unsafe numbers, blocked actions, or critical console warnings', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);
    await setAuthToken(page);
    await mockNinetyDayJourneyApi(page);

    for (const route of JOURNEY_ROUTES) {
      await gotoApp(page, route.path);
      await page.waitForLoadState('domcontentloaded');
      for (const pattern of route.expected) {
        await expect(page.locator('body'), `${route.name} should show mocked journey signal ${pattern}`).toContainText(pattern, { timeout: 20_000 });
      }
      await expectNoUnsafeRenderedText(page);
      await expectBottomNavDoesNotCoverInteractiveContent(page);
    }

    expect(consoleMessages).toEqual([]);
  });
});
