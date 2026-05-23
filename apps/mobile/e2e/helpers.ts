import { Page } from '@playwright/test';

export async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

export async function setAuthToken(page: Page, token = 'test-token', userId = 'user-1') {
  await page.addInitScript(({ token: authToken, userId: authUserId }) => {
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('user_id', authUserId);
  }, { token, userId });
}

export function jsonResponse(obj: any) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(obj),
  };
}
