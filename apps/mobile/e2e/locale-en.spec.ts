import { test, expect } from '@playwright/test';
import {
  gotoApp,
  mockNinetyDayJourneyApi,
  setAuthToken,
  setLocale,
} from './helpers';

const AUTHENTICATED_ROUTES = [
  '/',
  '/scan',
  '/log',
  '/progress',
  '/coach',
  '/insights',
  '/profile',
  '/strength',
  '/achievements',
  '/paywall',
  '/health-sync',
];

const PUBLIC_ROUTES = ['/(auth)/login', '/(auth)/register'];

const VIETNAMESE_DIACRITICS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

test.describe('English locale', () => {
  test('primary app routes do not render Vietnamese UI copy', async ({ page }) => {
    await setAuthToken(page);
    await setLocale(page);
    await mockNinetyDayJourneyApi(page);

    for (const path of AUTHENTICATED_ROUTES) {
      await gotoApp(page, path);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body'), `${path} should render English UI`).not.toContainText(VIETNAMESE_DIACRITICS, { timeout: 15_000 });
    }
  });

  test('public auth routes do not render Vietnamese UI copy', async ({ page }) => {
    await setLocale(page);

    for (const path of PUBLIC_ROUTES) {
      await gotoApp(page, path);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body'), `${path} should render English UI`).not.toContainText(VIETNAMESE_DIACRITICS, { timeout: 15_000 });
    }
  });
});
